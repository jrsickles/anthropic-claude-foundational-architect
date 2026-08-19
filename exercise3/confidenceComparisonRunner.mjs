/**
 * Exercise 3, Step 5 — Runs BOTH confidence methods against the same 24
 * ground truth documents and compares them directly: individual accuracy/
 * calibration reports, plus a side-by-side table of every field that either
 * method got wrong, showing whether each method's flag caught it.
 *
 * IMPORTANT CAVEAT: self-consistency and self-reported confidence make
 * SEPARATE, INDEPENDENT sets of API calls (self-consistency: 3 calls per
 * doc; self-reported: 1 call per doc). The model is not perfectly
 * deterministic even under tool_choice forcing, so it's possible for the
 * two methods to land on slightly different "correct"/"wrong" outcomes for
 * the same field on the same document just from ordinary sampling
 * variance — not because one method is inherently better at extraction.
 * The comparison below is about whether each method's CONFIDENCE FLAG
 * predicts ITS OWN errors, not a claim that both methods necessarily made
 * identical mistakes.
 *
 * COST NOTE: 24 docs x (3 self-consistency calls + 1 self-reported call)
 * = 96 real API calls total.
 *
 * Needs: npm install @anthropic-ai/sdk dotenv
 * Usage: node confidenceComparisonRunner.mjs
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractionTool } from "./extractionTool.js";
import { extractionToolWithConfidence } from "./extractionToolWithConfidence.mjs";
import { groundTruthDocuments } from "./groundTruthDocuments.mjs";
import { extractWithSelfConsistency } from "./selfConsistency.mjs";
import { extractWithSelfReportedConfidence } from "./selfReportedConfidence.mjs";
import { analyzeAccuracy, printAccuracyReport } from "./accuracyAnalysis.mjs";
import { EXTRACTION_FIELDS } from "./extractionFields.mjs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
    const scRuns = [];
    const srRuns = [];
    const mismatchRows = [];

    for (const doc of groundTruthDocuments) {
        const [sc, sr] = await Promise.all([
            extractWithSelfConsistency(client, extractionTool, doc.text),
            extractWithSelfReportedConfidence(client, extractionToolWithConfidence, doc.text)
        ]);

        scRuns.push({ docType: doc.docType, expected: doc.expected, finalData: sc.finalData, fieldConfidence: sc.fieldConfidence });
        srRuns.push({ docType: doc.docType, expected: doc.expected, finalData: sr.finalData, fieldConfidence: sr.fieldConfidence });

        for (const field of EXTRACTION_FIELDS) {
            const scCorrect = deepEqual(sc.finalData[field], doc.expected[field]);
            const srCorrect = deepEqual(sr.finalData[field], doc.expected[field]);
            if (!scCorrect || !srCorrect) {
                mismatchRows.push({
                    doc: doc.id,
                    field,
                    scCorrect, scFlagged: sc.fieldConfidence[field] === "low",
                    srCorrect, srFlagged: sr.fieldConfidence[field] === "low"
                });
            }
        }

        console.log(`done: ${doc.id}`);
    }

    console.log("\n\n=========================================");
    console.log("=== SELF-CONSISTENCY (3x sampling) ===");
    console.log("=========================================");
    printAccuracyReport(analyzeAccuracy(scRuns));

    console.log("\n\n=========================================");
    console.log("=== SELF-REPORTED (model's own rating) ===");
    console.log("=========================================");
    printAccuracyReport(analyzeAccuracy(srRuns));

    console.log("\n\n=========================================");
    console.log("=== HEAD-TO-HEAD: every field either method got wrong ===");
    console.log("=========================================");
    console.log("doc".padEnd(20) + "field".padEnd(18) + "SC:correct/flagged".padEnd(22) + "SR:correct/flagged");
    mismatchRows.forEach((r) => {
        console.log(
            r.doc.padEnd(20) +
            r.field.padEnd(18) +
            `${r.scCorrect ? "✓" : "✗"}/${r.scFlagged ? "flagged" : "-"}`.padEnd(22) +
            `${r.srCorrect ? "✓" : "✗"}/${r.srFlagged ? "flagged" : "-"}`
        );
    });

    const scWrongCaught = mismatchRows.filter((r) => !r.scCorrect && r.scFlagged).length;
    const scWrongTotal = mismatchRows.filter((r) => !r.scCorrect).length;
    const srWrongCaught = mismatchRows.filter((r) => !r.srCorrect && r.srFlagged).length;
    const srWrongTotal = mismatchRows.filter((r) => !r.srCorrect).length;

    console.log(`\nSelf-consistency caught ${scWrongCaught}/${scWrongTotal} of its own wrong fields.`);
    console.log(`Self-reported caught ${srWrongCaught}/${srWrongTotal} of its own wrong fields.`);
}

main().catch((err) => {
    console.error("Confidence comparison run failed:", err);
    process.exit(1);
});
