/**
 * Exercise 3, Step 5 — Runs the ground truth set through self-consistency
 * extraction, routes low-confidence documents to human review, and prints
 * an accuracy analysis by field/document type plus a calibration check on
 * whether the confidence flag actually predicts real errors.
 *
 * COST NOTE: this makes REAL API calls — 24 documents x 3 samples each =
 * 72 calls. Small individually, but real money, unlike steps 2/3/4's mock
 * or free deterministic runs. That's the deliberate tradeoff for this step
 * (see the conversation this was designed in): a mocked "accuracy" number
 * would just measure our own mock logic, not the actual model.
 *
 * Needs: npm install @anthropic-ai/sdk dotenv
 * Usage: node reviewRoutingRunner.mjs
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractionTool } from "./extractionTool.js";
import { groundTruthDocuments } from "./groundTruthDocuments.mjs";
import { extractWithSelfConsistency } from "./selfConsistency.mjs";
import { routeForReview } from "./reviewRouter.mjs";
import { analyzeAccuracy, printAccuracyReport } from "./accuracyAnalysis.mjs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
    const runs = [];
    let routedCount = 0;

    for (const doc of groundTruthDocuments) {
        const { finalData, fieldConfidence, disagreements } = await extractWithSelfConsistency(
            client,
            extractionTool,
            doc.text
        );
        const routing = routeForReview(fieldConfidence);
        if (routing.needsReview) routedCount += 1;

        runs.push({ docType: doc.docType, expected: doc.expected, finalData, fieldConfidence });

        console.log(`\n=== ${doc.id} (${doc.docType}) ===`);
        console.log(`  routed to human review: ${routing.needsReview}`);
        if (routing.needsReview) {
            console.log(`  low-confidence fields: ${routing.lowConfidenceFields.join(", ")}`);
            routing.lowConfidenceFields.forEach((f) => console.log(`    ${f}: samples = ${JSON.stringify(disagreements[f])}`));
        }
        const mismatches = Object.keys(doc.expected).filter((f) => JSON.stringify(finalData[f]) !== JSON.stringify(doc.expected[f]));
        if (mismatches.length) {
            console.log(`  ACTUAL ERRORS vs ground truth: ${mismatches.map((f) => `${f} (got ${JSON.stringify(finalData[f])}, expected ${JSON.stringify(doc.expected[f])})`).join("; ")}`);
        }
    }

    console.log(`\n\n=== Routing summary ===`);
    console.log(`  ${routedCount} / ${groundTruthDocuments.length} documents routed to human review`);

    const analysis = analyzeAccuracy(runs);
    printAccuracyReport(analysis);
}

main().catch((err) => {
    console.error("Review routing run failed:", err);
    process.exit(1);
});
