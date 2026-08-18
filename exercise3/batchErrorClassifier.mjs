/**
 * Exercise 3, Step 4 — Classifies a batch result into one of three
 * remediation paths. This is the batch-scale analog of step 2's
 * resolved-vs-unresolved classification, but at the level of "what kind of
 * resubmission (if any) could possibly fix this" rather than field-level
 * validation errors.
 *
 * Per the real Messages Batches API (verified against
 * https://platform.claude.com/docs/en/build-with-claude/batch-processing),
 * a non-succeeded result has one of THREE types, not one generic "errored":
 *   - "errored"  — the request itself failed; details in result.error
 *   - "canceled" — the whole batch was canceled before this request
 *                  processed (not billable); no result.error at all
 *   - "expired"  — the batch hit its 24-hour processing window before this
 *                  request was reached (not billable); no result.error either
 * An earlier version of this classifier only looked at `result.error`,
 * which is undefined for canceled/expired results — that would have thrown
 * or silently mis-classified those two cases. classifyBatchError now takes
 * the whole `result` object.
 */

export const REMEDIATION = {
    TRANSIENT: "transient", // resubmit unchanged
    OVERSIZED: "oversized", // chunk, then resubmit each chunk
    UNFIXABLE: "unfixable" // no resubmission can fix this; flag for human review
};

const TRANSIENT_ERROR_TYPES = new Set(["overloaded_error", "api_error", "timeout_error"]);
const OVERSIZED_PATTERN = /prompt is too long|reduce the length|context length|maximum context/i;
const EMPTY_CONTENT_PATTERN = /text content blocks must be non-empty|content.*empty/i;

/**
 * @param {{type: "errored"|"canceled"|"expired", error?: {type: string, message: string}}} result
 */
export function classifyBatchError(result) {
    if (!result) return REMEDIATION.UNFIXABLE;

    if (result.type === "expired") {
        // The request itself was never attempted — the BATCH ran out of time,
        // not this request. Nothing to fix about the request; just resubmit.
        return REMEDIATION.TRANSIENT;
    }

    if (result.type === "canceled") {
        // A human (or calling code) deliberately canceled the batch. Silently
        // auto-resubmitting something that was intentionally canceled could
        // undo a real decision — treat as needing a human's explicit call.
        return REMEDIATION.UNFIXABLE;
    }

    const error = result.error;
    if (!error) return REMEDIATION.UNFIXABLE;

    if (TRANSIENT_ERROR_TYPES.has(error.type)) {
        return REMEDIATION.TRANSIENT;
    }

    if (error.type === "invalid_request_error" && OVERSIZED_PATTERN.test(error.message ?? "")) {
        return REMEDIATION.OVERSIZED;
    }

    if (error.type === "invalid_request_error" && EMPTY_CONTENT_PATTERN.test(error.message ?? "")) {
        return REMEDIATION.UNFIXABLE;
    }

    // Any other invalid_request_error (malformed schema, bad params, etc.) is
    // a bug in OUR request construction, not something resubmission fixes —
    // treat conservatively as unfixable-without-code-changes rather than
    // silently retrying something that will just fail identically again.
    return REMEDIATION.UNFIXABLE;
}
