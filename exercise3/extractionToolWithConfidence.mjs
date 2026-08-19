/**
 * Exercise 3, Step 5 — Self-reported confidence variant of extractionTool.js.
 *
 * A SEPARATE tool, not a modification of extractionTool.js — steps 1-4 keep
 * using the original unchanged, and this exists purely so self-reported
 * confidence can be compared against self-consistency
 * (selfConsistency.mjs) rather than one replacing the other.
 *
 * Adds one sibling property, `field_confidence`, mirroring every extraction
 * field with a self-rated "high" | "medium" | "low" label. This is the
 * model's own claim about its certainty — NOT a calibrated probability (the
 * API exposes no token-level log-probabilities), and known to be a less
 * trustworthy signal than measured instability. Whether that theoretical
 * concern holds up in practice is exactly what confidenceComparisonRunner.mjs
 * checks, rather than assuming it either way.
 */

export const extractionToolWithConfidence = {
    name: "extract_review_data_with_confidence",
    description:
        "Extract structured data from a product review AND rate your own confidence " +
        "in each individual field. Only populate fields with information explicitly " +
        "stated or clearly implied in the text. If a field's value is not present in " +
        "the source text, set it to null rather than guessing. Do not fabricate names, " +
        "dates, ratings, or details that are not in the review. " +
        "For field_confidence: rate 'high' only when the field is directly and " +
        "unambiguously stated in the text (or its correct null-ness is unambiguous). " +
        "Rate 'medium' when you had to infer or interpret rather than read the value " +
        "directly. Rate 'low' when the text is ambiguous, contradictory, or you are " +
        "genuinely unsure whether your answer is correct. Be honest and self-critical — " +
        "do not default to 'high' out of habit.",
    input_schema: {
        type: "object",
        properties: {
            product_name: { type: "string", description: "The name of the product being reviewed, as stated in the text." },
            rating: {
                type: ["integer", "null"], minimum: 1, maximum: 5,
                description: "Star rating out of 5, ONLY if explicitly stated or unambiguously implied. Null if no rating signal at all."
            },
            sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"], description: "Overall sentiment of the review." },
            reviewer_name: { type: ["string", "null"], description: "Name or username of the reviewer, if disclosed. Null if not given." },
            review_date: { type: ["string", "null"], description: "Date the review was written, ISO 8601, if stated. Null if not mentioned." },
            purchase_verified: { type: ["boolean", "null"], description: "Whether the review indicates a verified purchase. Null if not mentioned." },
            would_recommend: { type: ["boolean", "null"], description: "Whether the reviewer explicitly says they would/would not recommend. Null if not stated." },
            defect_type: {
                type: "string", enum: ["none", "quality", "shipping_damage", "packaging", "functionality", "other"],
                description: "Category of defect or complaint mentioned, if any."
            },
            defect_detail: { type: ["string", "null"], description: "Required free-text explanation when defect_type is 'other'. Null otherwise." },

            field_confidence: {
                type: "object",
                description: "Your self-rated confidence for EACH field above, independently.",
                properties: {
                    product_name: { type: "string", enum: ["high", "medium", "low"] },
                    rating: { type: "string", enum: ["high", "medium", "low"] },
                    sentiment: { type: "string", enum: ["high", "medium", "low"] },
                    reviewer_name: { type: "string", enum: ["high", "medium", "low"] },
                    review_date: { type: "string", enum: ["high", "medium", "low"] },
                    purchase_verified: { type: "string", enum: ["high", "medium", "low"] },
                    would_recommend: { type: "string", enum: ["high", "medium", "low"] },
                    defect_type: { type: "string", enum: ["high", "medium", "low"] },
                    defect_detail: { type: "string", enum: ["high", "medium", "low"] }
                },
                required: [
                    "product_name", "rating", "sentiment", "reviewer_name", "review_date",
                    "purchase_verified", "would_recommend", "defect_type", "defect_detail"
                ]
            }
        },
        required: ["product_name", "rating", "sentiment", "defect_type", "field_confidence"],
        if: { properties: { defect_type: { const: "other" } } },
        then: { properties: { defect_detail: { type: "string" } }, required: ["defect_detail"] }
    }
};
