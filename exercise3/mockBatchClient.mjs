/**
 * Exercise 3, Step 4 — Scripted stand-in for the real Anthropic Messages
 * Batches API surface (client.messages.batches.create/retrieve/results).
 *
 * Verified against https://platform.claude.com/docs/en/build-with-claude/batch-processing
 * (fetched live, not from training memory — an earlier draft of this file
 * guessed at the retrieve() response shape and got request_counts wrong;
 * see the note on request_counts below).
 *
 * Kept interface-compatible with the real SDK on purpose: batchPipeline.mjs
 * calls this exactly the way it would call `client.messages.batches`, so
 * swapping the mock for `new Anthropic({apiKey}).messages.batches` is a
 * one-line change, not a rewrite. See REAL_USAGE_NOTES at the bottom of
 * batchPipeline.mjs.
 *
 * Scripted behavior, keyed by each source document's `category` (a field
 * that exists ONLY in this mock's bookkeeping — the pipeline code never
 * reads `.category`, it only ever sees custom_id + the API-shaped result,
 * exactly like it would against the real API):
 *   - "normal"     -> succeeds, with a fakeExtract()-derived tool_use input
 *   - "oversized"  -> errors invalid_request_error "prompt is too long..."
 *   - "unfixable"  -> errors invalid_request_error "...must be non-empty"
 *   - "flaky"      -> errors overloaded_error the FIRST time this custom_id
 *                     is submitted, succeeds on any later submission
 *   - "expired"    -> result.type "expired" (no error object) the FIRST time,
 *                     succeeds on any later submission
 *   - "canceled"   -> result.type "canceled" (no error object) every time —
 *                     never recovers, matching how our pipeline never
 *                     resubmits an UNFIXABLE result anyway
 *   - chunk requests (custom_id containing "::chunk") are always treated as
 *     "normal" — chunking is what turns an oversized doc into requests this
 *     mock will actually accept, mirroring how a real oversized document
 *     stops erroring once it's small enough.
 */

import { fakeExtract } from "./fakeExtract.mjs";
import { OVERSIZED_CHAR_THRESHOLD } from "./batchDocuments.mjs";

export function createMockBatchClient(sourceDocuments, clock) {
    const categoryByCustomId = new Map(sourceDocuments.map((d) => [d.custom_id, d.category]));
    const seenBefore = new Set(); // custom_ids that have failed once already (for "flaky")
    const batches = new Map();
    let nextBatchNum = 1;

    function categorize(customId) {
        if (customId.includes("::chunk")) return "normal"; // chunks are pre-shrunk by construction
        return categoryByCustomId.get(customId) ?? "normal";
    }

    function scriptResult(customId, text) {
        const category = categorize(customId);

        if (category === "oversized" && text.length > OVERSIZED_CHAR_THRESHOLD) {
            return {
                custom_id: customId,
                result: {
                    type: "errored",
                    error: {
                        type: "invalid_request_error",
                        message: `prompt is too long: ${text.length} characters exceeds the maximum; reduce the length of your messages`
                    }
                }
            };
        }

        if (category === "unfixable") {
            return {
                custom_id: customId,
                result: {
                    type: "errored",
                    error: { type: "invalid_request_error", message: "messages.0.content: text content blocks must be non-empty" }
                }
            };
        }

        if (category === "flaky" && !seenBefore.has(customId)) {
            seenBefore.add(customId);
            return {
                custom_id: customId,
                result: { type: "errored", error: { type: "overloaded_error", message: "Overloaded" } }
            };
        }

        if (category === "expired" && !seenBefore.has(customId)) {
            seenBefore.add(customId);
            // Real "expired" results carry NO error object at all — the request
            // itself was never attempted, the batch just ran out of its 24h
            // window before reaching it. Nothing wrong with the request, so
            // (like "flaky") it succeeds cleanly once resubmitted.
            return { custom_id: customId, result: { type: "expired" } };
        }

        if (category === "canceled") {
            // Unlike "flaky"/"expired", this deliberately never recovers on a
            // later call — a real canceled result stays canceled, and our
            // pipeline's classifier (UNFIXABLE) never resubmits it anyway, so
            // there's no resubmission path that would reach this a second time.
            return { custom_id: customId, result: { type: "canceled" } };
        }

        // Succeeds (first-time normal doc, chunk, or a flaky/expired doc's retry).
        return {
            custom_id: customId,
            result: {
                type: "succeeded",
                message: { content: [{ type: "tool_use", id: `toolu_${customId}`, input: fakeExtract(text) }] }
            }
        };
    }

    function requestCounts(results) {
        // Real shape (per the docs): processing, succeeded, errored, canceled,
        // expired — NOT a single "total" field, which an earlier draft of this
        // mock invented without checking. All requests are done processing by
        // the time our simulated batch reaches "ended", so `processing` is 0.
        const counts = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
        for (const r of results) counts[r.result.type] += 1;
        return counts;
    }

    return {
        messages: {
            // Synchronous single-request path (the SLA-protecting fallback).
            // Real latency for one tool_use call is a couple seconds; we
            // simulate that cost on the clock instead of a fixed instant, so
            // "we sent 12 synchronous requests" still shows up as SOME
            // elapsed time in the final SLA report, not a free lunch.
            async create({ messages }) {
                clock.advanceMs(2000);
                const text = messages[0].content.replace(/^Extract structured data from this product review:\n\n/, "");
                // Synchronous calls in this mock always "succeed" if they get this
                // far — a real flaky/oversized doc could still fail synchronously,
                // but by the time we're in the SLA-fallback path we've already
                // chunked oversized text and are only retrying transient failures,
                // which by definition succeed on a later attempt.
                return { content: [{ type: "tool_use", id: "toolu_sync", input: fakeExtract(text) }] };
            },
            batches: {
                /**
                 * @param {{requests: Array<{custom_id: string, params: {messages: Array}}>}} args
                 * @param {{simulatedDurationMinutes: number}} scriptOpts - mock-only: how much
                 *   simulated time this batch "takes" to process, advanced on the clock when
                 *   retrieve() is called. A real client has no such parameter.
                 */
                async create({ requests }, scriptOpts = {}) {
                    const id = `batch_${String(nextBatchNum++).padStart(3, "0")}`;
                    const createdAtMs = clock.now();
                    batches.set(id, {
                        id,
                        requests,
                        createdAtMs,
                        simulatedDurationMinutes: scriptOpts.simulatedDurationMinutes ?? 60,
                        retrieved: false,
                        results: null
                    });
                    return {
                        id,
                        processing_status: "in_progress",
                        created_at: new Date(createdAtMs).toISOString(),
                        ended_at: null,
                        request_counts: { processing: requests.length, succeeded: 0, errored: 0, canceled: 0, expired: 0 }
                    };
                },

                async retrieve(batchId) {
                    const batch = batches.get(batchId);
                    if (!batch) throw new Error(`Unknown batch id: ${batchId}`);
                    if (!batch.retrieved) {
                        clock.advanceMinutes(batch.simulatedDurationMinutes);
                        batch.retrieved = true;
                        batch.endedAtMs = clock.now();
                        // Real batches compute all results server-side before
                        // processing_status flips to "ended" — retrieve() reports
                        // counts, results() fetches the (already-computed) data.
                        batch.results = batch.requests.map((req) => {
                            const text = req.params.messages[0].content.replace(
                                /^Extract structured data from this product review:\n\n/,
                                ""
                            );
                            return scriptResult(req.custom_id, text);
                        });
                    }
                    return {
                        id: batch.id,
                        processing_status: batch.retrieved ? "ended" : "in_progress",
                        created_at: new Date(batch.createdAtMs).toISOString(),
                        ended_at: batch.retrieved ? new Date(batch.endedAtMs).toISOString() : null,
                        request_counts: batch.retrieved
                            ? requestCounts(batch.results)
                            : { processing: batch.requests.length, succeeded: 0, errored: 0, canceled: 0, expired: 0 }
                    };
                },

                async results(batchId) {
                    const batch = batches.get(batchId);
                    if (!batch) throw new Error(`Unknown batch id: ${batchId}`);
                    if (!batch.results) throw new Error(`Batch ${batchId} has not ended yet — call retrieve() until "ended" first`);
                    return batch.results;
                }
            }
        }
    };
}
