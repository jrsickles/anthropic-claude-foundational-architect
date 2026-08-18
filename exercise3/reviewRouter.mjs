/**
 * Exercise 3, Step 5 — Human review routing decision.
 *
 * Policy: route the WHOLE document to human review if ANY field came back
 * low-confidence (rather than only routing individual fields) — a reviewer
 * looking at one flagged field still needs the rest of the document's
 * context to judge it, so partial-document review isn't actually cheaper
 * in practice, just more fragmented. The specific low-confidence fields are
 * still reported, so the reviewer knows what to focus on rather than
 * re-checking everything from scratch.
 */

export function routeForReview(fieldConfidence) {
    const lowConfidenceFields = Object.entries(fieldConfidence)
        .filter(([, level]) => level === "low")
        .map(([field]) => field);

    return {
        needsReview: lowConfidenceFields.length > 0,
        lowConfidenceFields
    };
}
