/**
 * Exercise 3, Step 4 — Batch processing pipeline.
 *
 * Round 1: submit all documents as one batch. Classify every result by
 * custom_id into succeeded / transient / oversized / unfixable.
 * Round 2: before resubmitting anything, check the remaining SLA budget.
 *   - If a second BATCH round-trip would still plausibly fit, resubmit
 *     transient failures unchanged and oversized failures as chunks, as
 *     another batch (cheaper, but only makes sense if there's time for it).
 *   - If the remaining budget is too tight for another batch round-trip,
 *     fall back to the SYNCHRONOUS Messages API for the same set of
 *     documents. More expensive per-request, but the only way to protect
 *     a tight SLA once one batch round has already used up most of it.
 * Merge: for documents that were chunked, combine each chunk's (partial)
 * extraction into one record per original document, taking the first
 * non-null value per field and flagging any field where chunks disagree.
 * Unfixable failures are never resubmitted — they're returned as a list
 * for human review.
 */

import { extractionTool } from "./extractionTool.js";
import { validateExtraction } from "./validator.mjs";
import { classifyBatchError, REMEDIATION } from "./batchErrorClassifier.mjs";
import { buildChunkRequests, parentCustomId, isChunkCustomId } from "./chunking.mjs";
import { evaluateSla, formatDuration, SLA_MS } from "./slaTracker.mjs";

const ASSUMED_BATCH_ROUND_TRIP_MS = 120 * 60 * 1000; // conservative estimate; API's only hard guarantee is 24h

function buildRequest(customId, text) {
    return {
        custom_id: customId,
        params: {
            model: "claude-sonnet-4-5",
            max_tokens: 1024,
            tools: [extractionTool],
            tool_choice: { type: "tool", name: extractionTool.name },
            messages: [{ role: "user", content: `Extract structured data from this product review:\n\n${text}` }]
        }
    };
}

async function submitBatchAndAwait(client, requests, scriptOpts) {
    const created = await client.messages.batches.create({ requests }, scriptOpts);
    // Real implementation: poll on an interval (e.g. every 30-60s) until
    // processing_status === "ended" instead of calling retrieve() once. The
    // mock resolves to "ended" on first retrieve() because it simulates
    // elapsed time via the clock rather than making you actually wait.
    let status;
    do {
        status = await client.messages.batches.retrieve(created.id);
    } while (status.processing_status !== "ended");
    const results = await client.messages.batches.results(created.id);
    return { batch: status, results };
}

function classifyResults(results, sourceTextByCustomId) {
    const succeeded = [];
    const transient = [];
    const oversized = [];
    const unfixable = [];

    for (const r of results) {
        if (r.result.type === "succeeded") {
            const toolUse = r.result.message.content.find((b) => b.type === "tool_use");
            const { valid, errors } = validateExtraction(extractionTool.input_schema, toolUse.input);
            succeeded.push({ custom_id: r.custom_id, data: toolUse.input, schemaValid: valid, schemaErrors: errors });
        } else {
            const remediation = classifyBatchError(r.result);
            // result.error only exists for type "errored" — canceled/expired
            // carry no error object at all, per the real API shape.
            const entry = {
                custom_id: r.custom_id,
                resultType: r.result.type,
                error: r.result.error ?? null
            };
            if (remediation === REMEDIATION.TRANSIENT) transient.push(entry);
            else if (remediation === REMEDIATION.OVERSIZED) oversized.push(entry);
            else unfixable.push(entry);
        }
    }

    return { succeeded, transient, oversized, unfixable };
}

/**
 * Merges per-chunk extractions for one original document into a single
 * record. First non-null value wins per field; disagreements are flagged
 * rather than silently resolved.
 */
function mergeChunkResults(originalCustomId, chunkResults) {
    const merged = {};
    const conflicts = [];
    const fields = new Set(chunkResults.flatMap((c) => Object.keys(c.data)));

    for (const field of fields) {
        const values = chunkResults.map((c) => c.data[field]).filter((v) => v !== null && v !== undefined);
        const distinct = [...new Set(values.map((v) => JSON.stringify(v)))];
        if (distinct.length === 0) {
            merged[field] = null;
        } else if (distinct.length === 1) {
            merged[field] = values[0];
        } else {
            merged[field] = values[0]; // first non-null wins...
            conflicts.push({ field, values }); // ...but the disagreement is recorded, not hidden
        }
    }

    return { custom_id: originalCustomId, data: merged, conflicts, chunkCount: chunkResults.length };
}

export async function runBatchPipeline(client, clock, sourceDocuments) {
    const sourceTextByCustomId = new Map(sourceDocuments.map((d) => [d.custom_id, d.text]));

    // ---- Round 1: submit everything ----
    const round1Requests = sourceDocuments.map((d) => buildRequest(d.custom_id, d.text));
    const round1StartIso = clock.nowIso();
    const round1 = await submitBatchAndAwait(client, round1Requests, { simulatedDurationMinutes: 165 });
    const round1EndIso = round1.batch.ended_at;

    const round1Classified = classifyResults(round1.results, sourceTextByCustomId);

    // ---- Decide round 2 strategy based on remaining SLA budget ----
    const elapsedSoFarMs = new Date(round1EndIso).getTime() - new Date(round1StartIso).getTime();
    const remainingBudgetMs = SLA_MS - elapsedSoFarMs;
    const useSyncFallback = remainingBudgetMs < ASSUMED_BATCH_ROUND_TRIP_MS;

    // ---- Build round 2 requests: transient (unchanged) + oversized (chunked) ----
    const round2Requests = [];
    const chunkMap = new Map(); // originalCustomId -> [chunk custom_ids]

    for (const t of round1Classified.transient) {
        round2Requests.push(buildRequest(t.custom_id, sourceTextByCustomId.get(t.custom_id)));
    }
    for (const o of round1Classified.oversized) {
        const chunks = buildChunkRequests(o.custom_id, sourceTextByCustomId.get(o.custom_id));
        chunkMap.set(o.custom_id, chunks.map((c) => c.custom_id));
        for (const c of chunks) round2Requests.push(buildRequest(c.custom_id, c.text));
    }

    // ---- Round 2: batch or synchronous fallback ----
    const round2StartIso = clock.nowIso();
    let round2Results = [];
    let round2EndIso;

    if (round2Requests.length === 0) {
        round2EndIso = clock.nowIso();
    } else if (useSyncFallback) {
        for (const req of round2Requests) {
            const response = await client.messages.create({ messages: req.params.messages });
            const toolUse = response.content.find((b) => b.type === "tool_use");
            round2Results.push({ custom_id: req.custom_id, result: { type: "succeeded", message: response } });
        }
        round2EndIso = clock.nowIso();
    } else {
        const round2 = await submitBatchAndAwait(client, round2Requests, { simulatedDurationMinutes: 130 });
        round2Results = round2.results;
        round2EndIso = round2.batch.ended_at;
    }

    const round2Classified = classifyResults(round2Results, sourceTextByCustomId);

    // ---- Merge chunked results back into one record per original document ----
    const mergedChunkedDocs = [];
    for (const [originalId, chunkIds] of chunkMap.entries()) {
        const chunkResults = round2Classified.succeeded.filter((r) => chunkIds.includes(r.custom_id));
        if (chunkResults.length > 0) {
            mergedChunkedDocs.push(mergeChunkResults(originalId, chunkResults));
        }
    }

    // ---- Final tallies ----
    const allSucceeded = [...round1Classified.succeeded, ...round2Classified.succeeded.filter((r) => !isChunkCustomId(r.custom_id))];
    const finalSucceededCount = allSucceeded.length + mergedChunkedDocs.length;
    const finalUnfixable = round1Classified.unfixable; // round 2 never touches these

    const sla = evaluateSla([
        { label: "round 1 (batch)", startIso: round1StartIso, endIso: round1EndIso },
        { label: `round 2 (${round2Requests.length === 0 ? "n/a" : useSyncFallback ? "synchronous fallback" : "batch"})`, startIso: round2StartIso, endIso: round2EndIso }
    ]);

    return {
        totalDocuments: sourceDocuments.length,
        round1: {
            succeeded: round1Classified.succeeded.length,
            transient: round1Classified.transient.length,
            oversized: round1Classified.oversized.length,
            unfixable: round1Classified.unfixable.length,
            durationMs: elapsedSoFarMs
        },
        round2Strategy: round2Requests.length === 0 ? "skipped (nothing to resubmit)" : useSyncFallback ? "synchronous fallback" : "batch",
        round2RequestCount: round2Requests.length,
        mergedChunkedDocs,
        finalSucceededCount,
        finalUnfixable,
        sla
    };
}

export function printReport(result) {
    console.log("=== Batch Pipeline Report ===");
    console.log(`Total documents submitted: ${result.totalDocuments}`);
    console.log(`\n--- Round 1 (batch) ---`);
    console.log(`  succeeded: ${result.round1.succeeded}`);
    console.log(`  transient failures (retry unchanged): ${result.round1.transient}`);
    console.log(`  oversized failures (needs chunking): ${result.round1.oversized}`);
    console.log(`  unfixable failures (human review): ${result.round1.unfixable}`);
    console.log(`  duration: ${formatDuration(result.round1.durationMs)}`);

    console.log(`\n--- Round 2 ---`);
    console.log(`  strategy: ${result.round2Strategy}`);
    console.log(`  requests: ${result.round2RequestCount}`);

    console.log(`\n--- Merged chunked documents ---`);
    if (result.mergedChunkedDocs.length === 0) console.log("  (none)");
    result.mergedChunkedDocs.forEach((m) => {
        console.log(`  ${m.custom_id} (merged from ${m.chunkCount} chunks):`);
        console.log(`    ${JSON.stringify(m.data)}`);
        if (m.conflicts.length) {
            console.log(`    CONFLICTS (flagged, not auto-resolved): ${JSON.stringify(m.conflicts)}`);
        }
    });

    console.log(`\n--- Unfixable (flagged for human review, never resubmitted) ---`);
    if (result.finalUnfixable.length === 0) console.log("  (none)");
    result.finalUnfixable.forEach((u) =>
        console.log(`  ${u.custom_id}: ${u.resultType}${u.error ? ` - ${u.error.type}: ${u.error.message}` : ""}`)
    );

    console.log(`\n--- Final tallies ---`);
    console.log(`  successfully extracted: ${result.finalSucceededCount} / ${result.totalDocuments}`);
    console.log(`  permanently failed: ${result.finalUnfixable.length} / ${result.totalDocuments}`);

    console.log(`\n--- SLA (${formatDuration(SLA_MS)} target) ---`);
    result.sla.perRound.forEach((r) => console.log(`  ${r.label}: ${formatDuration(r.ms)}`));
    console.log(`  total elapsed: ${formatDuration(result.sla.totalMs)}`);
    console.log(
        `  ${result.sla.withinSla ? "WITHIN SLA" : "SLA BREACHED"} (margin: ${result.sla.marginMs >= 0 ? "+" : ""}${formatDuration(Math.abs(result.sla.marginMs))})`
    );
}

/**
 * REAL_USAGE_NOTES:
 * To run this against the real API instead of the mock, swap the client:
 *
 *   import Anthropic from "@anthropic-ai/sdk";
 *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * and drop the SimulatedClock — batchPipeline.mjs reads timestamps off
 * `batch.created_at` / `batch.ended_at` either way, so the SLA math doesn't
 * change. The only mock-only surface is the `scriptOpts` second argument to
 * `client.messages.batches.create()` (real create() takes just one argument)
 * and the immediate-resolution behavior of retrieve() — a real polling loop
 * needs a delay between retrieve() calls (e.g. setTimeout 30-60s) since a
 * real batch can take up to 24 hours to reach "ended".
 */
