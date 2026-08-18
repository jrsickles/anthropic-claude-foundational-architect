/**
 * Exercise 3, Step 1 + Step 2 — Verification runner.
 *
 * Run this locally (Node.js) to sanity-check the tool schema and the
 * validation-retry loop against real API responses before wiring either
 * into the Vue app. Needs:
 *   npm install @anthropic-ai/sdk dotenv ajv
 * and a .env file with ANTHROPIC_API_KEY=sk-ant-...
 *
 * Usage: node testRunner.mjs
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractionTool } from "./extractionTool.js";
import { testDocuments } from "./testDocuments.js";
import { extractWithValidation } from "./validationLoop.mjs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function report(doc, result) {
    console.log(`\n=== ${doc.id} — ${doc.label} ===`);
    console.log(doc.text);
    console.log("--- final extraction ---");
    console.log(JSON.stringify(result.data, null, 2));
    console.log(
        `success: ${result.success} | attempts: ${result.attempts} | ` +
        `resolved-by-retry: ${result.resolvedErrors.length} | unresolved: ${result.unresolvedErrors.length}`
    );

    if (result.resolvedErrors.length) {
        console.log("  resolved (format mismatch, retry fixed it):");
        result.resolvedErrors.forEach((e) =>
            console.log(`    - ${e.path}: ${e.message} (fixed on attempt ${e.resolvedOnAttempt})`)
        );
    }
    if (result.unresolvedErrors.length) {
        console.log("  unresolved (information likely absent from source):");
        result.unresolvedErrors.forEach((e) => console.log(`    - ${e.path}: ${e.message}`));
    }
}

async function main() {
    for (const doc of testDocuments) {
        const result = await extractWithValidation(client, extractionTool, doc.text);
        report(doc, result);
    }
}

main().catch((err) => {
    console.error("Extraction run failed:", err);
    process.exit(1);
});
