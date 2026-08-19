/**
 * Exercise 3, Step 5 — Shared field list. Extracted out because
 * selfConsistency.mjs, accuracyAnalysis.mjs, and the new
 * selfReportedConfidence.mjs all need the same list of extraction fields,
 * and a third copy-pasted duplicate was one too many.
 */
export const EXTRACTION_FIELDS = [
    "product_name", "rating", "sentiment", "defect_type", "defect_detail",
    "reviewer_name", "review_date", "purchase_verified", "would_recommend"
];
