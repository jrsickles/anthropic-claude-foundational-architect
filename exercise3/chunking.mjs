/**
 * Exercise 3, Step 4 — Splits an oversized document into chunks small enough
 * to resubmit individually. Splits on paragraph boundaries first, falling
 * back to sentence boundaries, so a chunk boundary doesn't land mid-sentence
 * where avoidable (mid-sentence splits make per-chunk extraction noisier).
 */

const DEFAULT_CHUNK_TARGET_CHARS = 1000;

function splitIntoUnits(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length > 1) return paragraphs;
    // No paragraph breaks (our generated oversized docs are single-paragraph) —
    // fall back to sentence-ish splitting.
    return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

export function chunkDocument(text, targetChars = DEFAULT_CHUNK_TARGET_CHARS) {
    const units = splitIntoUnits(text);
    const chunks = [];
    let current = "";

    for (const unit of units) {
        if (current.length + unit.length + 1 > targetChars && current.length > 0) {
            chunks.push(current.trim());
            current = "";
        }
        current += (current ? " " : "") + unit;
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks;
}

/**
 * Builds new batch requests for a chunked document, one per chunk, with
 * custom_ids derived from the original so results can be traced back and
 * merged: "review-092" -> "review-092::chunk1", "review-092::chunk2", ...
 */
export function buildChunkRequests(originalCustomId, text, targetChars) {
    return chunkDocument(text, targetChars).map((chunkText, i) => ({
        custom_id: `${originalCustomId}::chunk${i + 1}`,
        text: chunkText
    }));
}

export function parentCustomId(chunkCustomId) {
    return chunkCustomId.split("::chunk")[0];
}

export function isChunkCustomId(customId) {
    return customId.includes("::chunk");
}
