/**
 * Exercise 3, Step 5 — Self-consistency confidence signal.
 *
 * Rationale: the Messages API doesn't expose token-level log-probabilities,
 * so there's no principled way to ask the model "how confident are you" and
 * get back a calibrated number — a model's OWN stated confidence is a
 * separate (and separately unreliable) claim, not something we're
 * generating here. Self-consistency instead measures something real: call
 * the extraction independently 3 times on the same document and see whether
 * the answers agree. A field where all 3 samples agree is field-level
 * high confidence; a field where they disagree is low confidence — the
 * disagreement itself IS the evidence, not a self-report.
 *
 * Cost note: 3x the API calls of a single extraction, vs. 1 call for
 * self-reported confidence (selfReportedConfidence.mjs). Known limitation
 * (confirmed empirically, not just assumed — see confidenceComparisonRunner.mjs):
 * this signal only catches genuine sampling INSTABILITY. A confident,
 * consistent-but-wrong answer looks identical to a confident, consistent,
 * CORRECT answer from this method's point of view — it can't be caught here.
 */

import { EXTRACTION_FIELDS as FIELDS } from "./extractionFields.mjs";

function majorityValue(values) {
    const counts = new Map();
    for (const v of values) {
        const key = JSON.stringify(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let bestKey = null;
    let bestCount = -1;
    for (const [key, count] of counts.entries()) {
        if (count > bestCount) {
            bestKey = key;
            bestCount = count;
        }
    }
    return { value: JSON.parse(bestKey), agreementCount: bestCount };
}

/**
 * @param {Anthropic} client
 * @param {object} tool
 * @param {string} documentText
 * @param {number} samples - how many independent extractions to run (default 3)
 * @returns {{
 *   finalData: object,               // majority value per field
 *   fieldConfidence: Record<string, "high"|"low">,
 *   disagreements: Record<string, any[]>,  // only for low-confidence fields: the distinct values seen
 *   rawSamples: object[]
 * }}
 */
export async function extractWithSelfConsistency(client, tool, documentText, samples = 3) {
    const calls = Array.from({ length: samples }, () =>
        client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 1024,
            tools: [tool],
            tool_choice: { type: "tool", name: tool.name },
            messages: [{ role: "user", content: `Extract structured data from this product review:\n\n${documentText}` }]
        })
    );
    const responses = await Promise.all(calls);
    const rawSamples = responses.map((r) => r.content.find((b) => b.type === "tool_use").input);

    const finalData = {};
    const fieldConfidence = {};
    const disagreements = {};

    for (const field of FIELDS) {
        const values = rawSamples.map((s) => s[field] ?? null);
        const { value, agreementCount } = majorityValue(values);
        finalData[field] = value;
        if (agreementCount === samples) {
            fieldConfidence[field] = "high";
        } else {
            fieldConfidence[field] = "low";
            disagreements[field] = values;
        }
    }

    return { finalData, fieldConfidence, disagreements, rawSamples };
}
