/**
 * Exercise 3, Step 2 — Deterministic test of the validation-retry loop.
 *
 * The real API run (5/5 documents, all valid on attempt 1) proved the loop
 * doesn't get in the way of good extractions, but it never exercised the
 * retry or classification branches — no real failure happened to trigger
 * them. This file scripts a fake Anthropic client that returns specific
 * (valid/invalid) tool_use payloads on each call, so we can prove the
 * resolved-by-retry vs unresolved classification logic works regardless
 * of whether the live model happens to misbehave on a given run.
 *
 * Usage: node validationLoop.test.mjs
 */

import {extractionTool} from "./extractionTool.js";
import {extractWithValidation} from "./validationLoop.mjs";

// Builds a fake response shaped like the real SDK's response.content array.
function toolUseResponse(id, input) {
    return {content: [{type: "tool_use", id, input}]};
}

/**
 * A scripted fake client: `responses` is an array of tool inputs to return,
 * one per call to `messages.create`, in order.
 */
function makeScriptedClient(responses) {
    let call = 0;
    return {
        messages: {
            async create() {
                const input = responses[Math.min(call, responses.length - 1)];
                const id = `toolu_fake_${call}`;
                call += 1;
                return toolUseResponse(id, input);
            }
        }
    };
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${message}`);
    }
}

async function testResolvedByRetry() {
    console.log("\n--- Scenario A: format mismatch, fixed on retry ---");
    // Attempt 1: rating out of range (7 > max 5). Attempt 2: corrected to 5.
    const client = makeScriptedClient([
        {
            product_name: "Aurora Blender Pro",
            rating: 7,
            sentiment: "positive",
            defect_type: "none",
            defect_detail: null
        },
        {product_name: "Aurora Blender Pro", rating: 5, sentiment: "positive", defect_type: "none", defect_detail: null}
    ]);

    const result = await extractWithValidation(client, extractionTool, "fake doc text");

    assert(result.success === true, "Scenario A: final result is valid");
    assert(result.attempts === 2, `Scenario A: took 2 attempts (got ${result.attempts})`);
    assert(result.resolvedErrors.length === 1, `Scenario A: exactly 1 error resolved by retry (got ${result.resolvedErrors.length})`);
    assert(
        result.resolvedErrors[0]?.keyword === "maximum",
        `Scenario A: resolved error was the 'maximum' violation (got ${result.resolvedErrors[0]?.keyword})`
    );
    assert(result.unresolvedErrors.length === 0, "Scenario A: no unresolved errors");
}

async function testUnresolvedAfterRetries() {
    console.log("\n--- Scenario B: if/then violation that never gets fixed ---");
    // defect_type "other" requires defect_detail to be a non-null string.
    // The scripted model keeps omitting it across every attempt, simulating
    // a case where the source document genuinely has nothing to put there.
    const badPayload = {
        product_name: "Aurora Blender Pro",
        rating: 1,
        sentiment: "negative",
        defect_type: "other",
        defect_detail: null
    };
    const client = makeScriptedClient([badPayload, badPayload, badPayload]);

    const result = await extractWithValidation(client, extractionTool, "fake doc text", {maxRetries: 2});

    assert(result.success === false, "Scenario B: final result is invalid");
    assert(result.attempts === 3, `Scenario B: exhausted all 3 attempts (got ${result.attempts})`);
    assert(result.unresolvedErrors.length >= 1, `Scenario B: at least 1 unresolved error (got ${result.unresolvedErrors.length})`);
    assert(
        result.unresolvedErrors.every((e) => e.reason === "information_absent_from_source"),
        "Scenario B: unresolved errors are tagged information_absent_from_source"
    );
    assert(result.resolvedErrors.length === 0, "Scenario B: nothing was resolved (error never changed)");
}

async function testCleanFirstPass() {
    console.log("\n--- Scenario C: valid on attempt 1 (control case) ---");
    const client = makeScriptedClient([
        {product_name: "Aurora Blender Pro", rating: 5, sentiment: "positive", defect_type: "none", defect_detail: null}
    ]);

    const result = await extractWithValidation(client, extractionTool, "fake doc text");

    assert(result.success === true, "Scenario C: valid");
    assert(result.attempts === 1, `Scenario C: no retry needed (got ${result.attempts})`);
    assert(result.resolvedErrors.length === 0, "Scenario C: nothing to resolve");
    assert(result.unresolvedErrors.length === 0, "Scenario C: nothing unresolved");
}

async function main() {
    await testResolvedByRetry();
    await testUnresolvedAfterRetries();
    await testCleanFirstPass();

    if (process.exitCode === 1) {
        console.log("\nSome assertions FAILED — see above.");
    } else {
        console.log("\nAll assertions passed.");
    }
}

main();
