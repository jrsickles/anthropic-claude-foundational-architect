/**
 * Exercise 3, Step 5 — Self-reported confidence extraction.
 *
 * One API call. The model rates its own per-field confidence as part of the
 * same tool call (extractionToolWithConfidence.mjs), rather than us
 * inferring anything from repeated sampling. Cheaper than self-consistency
 * (1 call vs 3) but the reliability of the resulting flag is exactly what's
 * unverified until compared against ground truth — see
 * confidenceComparisonRunner.mjs.
 *
 * Policy for collapsing the model's 3-level self-rating to the same
 * high/low binary used by routeForReview and analyzeAccuracy: "medium" is
 * treated as "low" (i.e., flagged) — if the model itself says it had to
 * infer or interpret rather than read a value directly, that's exactly the
 * kind of field a reviewer should double check, not something to wave
 * through as good enough.
 */

import { EXTRACTION_FIELDS } from "./extractionFields.mjs";

export async function extractWithSelfReportedConfidence(client, tool, documentText) {
    const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: `Extract structured data from this product review:\n\n${documentText}` }]
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    const { field_confidence, ...finalData } = toolUse.input;

    const fieldConfidence = {};
    for (const field of EXTRACTION_FIELDS) {
        const selfRating = field_confidence?.[field] ?? "low";
        fieldConfidence[field] = selfRating === "high" ? "high" : "low";
    }

    return { finalData, fieldConfidence, rawSelfRating: field_confidence };
}
