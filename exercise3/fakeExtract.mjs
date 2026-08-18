/**
 * Exercise 3, Step 4 — Lightweight stand-in extractor used ONLY by the mock
 * batch client (mockBatchClient.mjs) to simulate what the model would return
 * for a given chunk of text. This is NOT a real extraction quality test —
 * steps 1-3 already covered that with the real API. Its only job here is to
 * produce plausible, partial-when-truncated JSON so the batch orchestration
 * logic (classification, chunking, merge, SLA) can be exercised
 * deterministically without spending real API calls on 100+ documents.
 */

const PRODUCTS = ["Aurora Blender Pro", "TrailBrew Camp Kettle", "Nova Watch X", "Solstice Desk Lamp"];

const DEFECT_KEYWORDS = [
    { pattern: /melt|crack|burn/i, defect_type: "quality" },
    { pattern: /shipping|damaged in transit|arrived broken/i, defect_type: "shipping_damage" },
    { pattern: /box|packaging/i, defect_type: "packaging" },
    { pattern: /app|pairing|bluetooth|firmware/i, defect_type: "functionality" }
];

export function fakeExtract(text) {
    const product = PRODUCTS.find((p) => text.includes(p)) ?? null;

    const ratingMatch = text.match(/(\d)\s*\/\s*5/) || text.match(/(\d)\s*stars?/i) || text.match(/Rating:\s*(\d)/i);
    const rating = ratingMatch ? Math.min(5, Math.max(1, parseInt(ratingMatch[1], 10))) : null;

    const defectHit = DEFECT_KEYWORDS.find((d) => d.pattern.test(text));
    const defect_type = defectHit ? defectHit.defect_type : rating !== null ? "none" : null;

    let sentiment = null;
    if (defectHit) sentiment = "negative";
    else if (rating !== null) sentiment = rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";

    return {
        product_name: product,
        rating,
        // sentiment/defect_type are required-non-null in the real schema; the
        // mock only omits them entirely when a chunk truly has no signal, so
        // downstream merge logic has something meaningful to fill in from a
        // sibling chunk.
        sentiment,
        defect_type,
        defect_detail: null,
        reviewer_name: null,
        review_date: null,
        purchase_verified: /verified purchase/i.test(text) ? true : null,
        would_recommend: /would (definitely )?recommend/i.test(text)
            ? true
            : /wouldn'?t (grab|buy|recommend)/i.test(text)
              ? false
              : null
    };
}
