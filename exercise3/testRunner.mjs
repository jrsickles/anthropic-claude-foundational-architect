/**
 * Exercise 3, Step 1 — Standalone verification runner.
 *
 * Run this locally (Node.js) to sanity-check the tool schema against
 * real API responses before wiring it into the Vue app. Needs:
 *   npm install @anthropic-ai/sdk dotenv
 * and a .env file with ANTHROPIC_API_KEY=sk-ant-...
 *
 * Usage: node testRunner.mjs
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractionTool } from "./extractionTool.js";
import { testDocuments } from "./testDocuments.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extract(reviewText) {
    const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        tools: [extractionTool],
        tool_choice: { type: "tool", name: "extract_review_data" },
        messages: [
            {
                role: "user",
                content: `Extract structured data from this product review:\n\n${reviewText}`
            }
        ]
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    return toolUse ? toolUse.input : null;
}

function report(doc, result) {
    console.log(`\n=== ${doc.id} — ${doc.label} ===`);
    console.log(doc.text);
    console.log("--- extracted ---");
    console.log(JSON.stringify(result, null, 2));

    const nullFields = Object.entries(result)
        .filter(([, v]) => v === null)
        .map(([k]) => k);
    console.log(`null fields returned: ${nullFields.length ? nullFields.join(", ") : "(none)"}`);
}

async function main() {
    for (const doc of testDocuments) {
        const result = await extract(doc.text);
        report(doc, result);
    }
}

main().catch((err) => {
    console.error("Extraction run failed:", err);
    process.exit(1);
});