/**
 * Exercise 3, Step 3 — Verifies improved handling of structural variety.
 *
 * Runs each structurally-varied document TWICE: once with zero few-shot
 * examples (baseline — same conditions as step 1/2), once with the
 * fewShotExamples turns injected. Prints both extractions side by side so
 * a real difference (or lack of one) is visible rather than assumed.
 *
 * Needs: npm install @anthropic-ai/sdk dotenv ajv
 * Usage: node comparisonRunner.mjs
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractionTool } from "./extractionTool.js";
import { structuralVarietyDocuments } from "./testDocuments.js";
import { extractWithValidation } from "./validationLoop.mjs";
import { buildFewShotMessages } from "./fewShotExamples.mjs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const fewShotMessages = buildFewShotMessages();

function summarize(result) {
    return {
        success: result.success,
        attempts: result.attempts,
        data: result.data
    };
}

function diff(baseline, withFewShot) {
    const keys = new Set([...Object.keys(baseline.data ?? {}), ...Object.keys(withFewShot.data ?? {})]);
    const differences = [];
    for (const key of keys) {
        const a = baseline.data?.[key];
        const b = withFewShot.data?.[key];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
            differences.push({ field: key, baseline: a, withFewShot: b });
        }
    }
    return differences;
}

async function main() {
    for (const doc of structuralVarietyDocuments) {
        console.log(`\n=== ${doc.id} — ${doc.label} ===`);
        console.log(doc.text);

        const baseline = await extractWithValidation(client, extractionTool, doc.text);
        const withFewShot = await extractWithValidation(client, extractionTool, doc.text, { fewShotMessages });

        console.log("\n--- baseline (no few-shot) ---");
        console.log(JSON.stringify(summarize(baseline), null, 2));

        console.log("\n--- with few-shot ---");
        console.log(JSON.stringify(summarize(withFewShot), null, 2));

        const differences = diff(baseline, withFewShot);
        console.log(`\n--- differences: ${differences.length ? "" : "(none)"}`);
        differences.forEach((d) =>
            console.log(`  ${d.field}: baseline=${JSON.stringify(d.baseline)} -> withFewShot=${JSON.stringify(d.withFewShot)}`)
        );
    }
}

main().catch((err) => {
    console.error("Comparison run failed:", err);
    process.exit(1);
});
