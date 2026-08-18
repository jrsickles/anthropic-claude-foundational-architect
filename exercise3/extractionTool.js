/**
 * Exercise 3, Step 1/2 — Extraction tool definition for product reviews.
 *
 * This is the `tools` array entry you pass to the Anthropic Messages API
 * to force structured output via tool_use.
 *
 * Step 2 change: `rating` is now nullable. Step 1 testing (doc_adversarial_no_rating)
 * proved that when a required, non-nullable field has no supporting text in the
 * source document, tool_choice: "tool" forces the model to fabricate a plausible
 * value rather than legally expressing "unknown." Making it nullable removes that
 * incentive. It stays in `required` — the model must always include the key — but
 * the key's value is now allowed to be null when the source text doesn't state it.
 */

export const extractionTool = {
    name: "extract_review_data",
    description:
        "Extract structured data from a product review. Only populate fields " +
        "with information explicitly stated or clearly implied in the text. " +
        "If a field's value is not present in the source text, set it to null " +
        "rather than guessing or inferring a plausible value. Do not fabricate " +
        "names, dates, ratings, or details that are not in the review.",
    input_schema: {
        type: "object",
        properties: {
            // --- Required fields: the key must always be present ---
            product_name: {
                type: "string",
                description: "The name of the product being reviewed, as stated in the text."
            },
            rating: {
                type: ["integer", "null"],
                minimum: 1,
                maximum: 5,
                description:
                    "Star rating out of 5, ONLY if explicitly stated or unambiguously implied " +
                    "(e.g. '5 stars', '4/5'). Null if the text gives no rating signal at all. " +
                    "Do not infer a rating from general sentiment or tone."
            },
            sentiment: {
                type: "string",
                enum: ["positive", "negative", "neutral", "mixed"],
                description: "Overall sentiment of the review."
            },

            // --- Optional + nullable: may not appear in the source text ---
            reviewer_name: {
                type: ["string", "null"],
                description: "Name or username of the reviewer, if disclosed. Null if anonymous or not given."
            },
            review_date: {
                type: ["string", "null"],
                description: "Date the review was written, in ISO 8601 (YYYY-MM-DD), if stated. Null if not mentioned."
            },
            purchase_verified: {
                type: ["boolean", "null"],
                description: "Whether the review indicates a verified purchase. Null if not mentioned either way."
            },
            would_recommend: {
                type: ["boolean", "null"],
                description: "Whether the reviewer explicitly says they would/would not recommend the product. Null if not stated."
            },

            // --- Enum + "other" + detail pattern ---
            defect_type: {
                type: "string",
                enum: ["none", "quality", "shipping_damage", "packaging", "functionality", "other"],
                description:
                    "Category of defect or complaint mentioned, if any. Use 'none' if no defect is " +
                    "mentioned. Use 'other' only if a defect is mentioned but doesn't fit the other " +
                    "categories, and pair it with defect_detail."
            },
            defect_detail: {
                type: ["string", "null"],
                description:
                    "Required free-text explanation when defect_type is 'other'. Null in all other cases."
            }
        },
        required: ["product_name", "rating", "sentiment", "defect_type"],
        // If defect_type is "other", defect_detail must be a non-null string.
        if: {
            properties: { defect_type: { const: "other" } }
        },
        then: {
            properties: { defect_detail: { type: "string" } },
            required: ["defect_detail"]
        }
    }
};
