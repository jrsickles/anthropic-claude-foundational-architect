/**
 * Exercise 3, Step 5 — Accuracy analysis by document type and field, plus
 * the calibration check that actually justifies (or doesn't) the routing
 * strategy: does "low confidence" correlate with "actually wrong"?
 *
 * Without this check, a confidence-based routing strategy is unverified —
 * it could be flagging things at random, or flagging nothing useful, and
 * you wouldn't know without comparing flags against real correctness.
 */

const FIELDS = [
    "product_name", "rating", "sentiment", "defect_type", "defect_detail",
    "reviewer_name", "review_date", "purchase_verified", "would_recommend"
];

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {Array<{docType: string, expected: object, finalData: object, fieldConfidence: Record<string,string>}>} runs
 */
export function analyzeAccuracy(runs) {
    const byField = {};
    const byDocType = {};
    let truePositive = 0; // flagged low-confidence AND actually wrong
    let falsePositive = 0; // flagged low-confidence but actually correct
    let falseNegative = 0; // NOT flagged, but actually wrong
    let trueNegative = 0; // NOT flagged, and actually correct

    for (const run of runs) {
        if (!byDocType[run.docType]) byDocType[run.docType] = { correct: 0, total: 0 };

        for (const field of FIELDS) {
            const correct = deepEqual(run.finalData[field], run.expected[field]);
            const flaggedLow = run.fieldConfidence[field] === "low";

            if (!byField[field]) byField[field] = { correct: 0, total: 0 };
            byField[field].total += 1;
            if (correct) byField[field].correct += 1;

            byDocType[run.docType].total += 1;
            if (correct) byDocType[run.docType].correct += 1;

            if (flaggedLow && !correct) truePositive += 1;
            else if (flaggedLow && correct) falsePositive += 1;
            else if (!flaggedLow && !correct) falseNegative += 1;
            else trueNegative += 1;
        }
    }

    const fieldAccuracy = Object.fromEntries(
        Object.entries(byField).map(([field, s]) => [field, s.correct / s.total])
    );
    const docTypeAccuracy = Object.fromEntries(
        Object.entries(byDocType).map(([type, s]) => [type, s.correct / s.total])
    );

    // Precision: of everything flagged low-confidence, how much was actually wrong?
    // Recall: of everything actually wrong, how much did we catch with a flag?
    const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : null;
    const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : null;

    return {
        fieldAccuracy,
        docTypeAccuracy,
        overallAccuracy: Object.values(byField).reduce((s, f) => s + f.correct, 0) /
            Object.values(byField).reduce((s, f) => s + f.total, 0),
        confidenceCalibration: { truePositive, falsePositive, falseNegative, trueNegative, precision, recall }
    };
}

export function printAccuracyReport(analysis) {
    console.log("\n--- Accuracy by field ---");
    Object.entries(analysis.fieldAccuracy)
        .sort((a, b) => a[1] - b[1])
        .forEach(([field, acc]) => console.log(`  ${field.padEnd(18)} ${(acc * 100).toFixed(1)}%`));

    console.log("\n--- Accuracy by document type ---");
    Object.entries(analysis.docTypeAccuracy)
        .sort((a, b) => a[1] - b[1])
        .forEach(([type, acc]) => console.log(`  ${type.padEnd(18)} ${(acc * 100).toFixed(1)}%`));

    console.log(`\n--- Overall field-level accuracy: ${(analysis.overallAccuracy * 100).toFixed(1)}% ---`);

    const c = analysis.confidenceCalibration;
    console.log("\n--- Confidence-flag calibration (does low-confidence predict wrong?) ---");
    console.log(`  flagged low-confidence AND actually wrong (true positive):  ${c.truePositive}`);
    console.log(`  flagged low-confidence BUT actually correct (false positive): ${c.falsePositive}`);
    console.log(`  NOT flagged BUT actually wrong (false negative, MISSED):    ${c.falseNegative}`);
    console.log(`  NOT flagged AND actually correct (true negative):          ${c.trueNegative}`);
    console.log(
        `  precision: ${c.precision === null ? "n/a" : (c.precision * 100).toFixed(1) + "%"} ` +
        `(of flagged fields, % actually wrong)`
    );
    console.log(
        `  recall:    ${c.recall === null ? "n/a" : (c.recall * 100).toFixed(1) + "%"} ` +
        `(of actually-wrong fields, % we caught)`
    );
}
