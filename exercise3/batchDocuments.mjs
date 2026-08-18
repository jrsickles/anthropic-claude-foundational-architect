/**
 * Exercise 3, Step 4 — Generates the 100-document batch.
 *
 * Uses a seeded PRNG (mulberry32) instead of Math.random so the batch is
 * reproducible across runs — useful when explaining/debugging a specific
 * outcome instead of chasing a different result every execution.
 *
 * Mix (100 total):
 *   89 normal documents      — varied lengths/formats, should all succeed
 *    4 oversized documents   — exceed OVERSIZED_CHAR_THRESHOLD, simulating a
 *                              real "prompt is too long" 400 at batch scale
 *    2 empty/whitespace docs — a genuinely unfixable API-level rejection
 *    1 "expired" document    — result.type "expired" (batch hit its 24h
 *                              window before reaching this request) on first
 *                              submission only; succeeds unchanged on resubmit
 *    1 "canceled" document   — result.type "canceled" (batch was canceled
 *                              before processing); always stays canceled —
 *                              per batchErrorClassifier.mjs this is UNFIXABLE
 *                              and our pipeline never resubmits it, so there's
 *                              no "recovers on retry" behavior to script here
 *    3 "flaky" documents     — errored with a transient error on first
 *                              submission only, succeed unchanged on resubmit
 */

export const OVERSIZED_CHAR_THRESHOLD = 3000;

const PRODUCTS = ["Aurora Blender Pro", "TrailBrew Camp Kettle", "Nova Watch X", "Solstice Desk Lamp"];

function mulberry32(seed) {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
}

function normalDoc(rng, index) {
    const product = pick(rng, PRODUCTS);
    const rating = 1 + Math.floor(rng() * 5);
    const verified = rng() > 0.5;
    const templates = [
        () =>
            `${rating} stars for the ${product}. ${rating >= 4 ? "Really happy with it, works great." : rating === 3 ? "It's fine, does the job." : "Disappointed, wouldn't buy again."}` +
            (verified ? " Verified purchase." : ""),
        () =>
            `Product: ${product}\nRating: ${rating}/5\n${rating >= 4 ? "Pros: reliable, easy to use\nCons: none really" : "Pros: does the basic job\nCons: build quality feels cheap"}` +
            (verified ? "\nVerified Purchase: Yes" : ""),
        () =>
            `so I've had the ${product} for a couple weeks now. ${rating >= 4 ? "honestly no complaints" : "kind of mixed feelings about it"}. ${rating}/5 from me.` +
            (verified ? " bought it myself, verified purchase." : "")
    ];
    return pick(rng, templates)();
}

function oversizedDoc(rng, index) {
    const product = pick(rng, PRODUCTS);
    const rating = 1 + Math.floor(rng() * 5);
    const opener = `Long-time user review of the ${product}. Rating: ${rating}/5. `;
    const filler =
        "This is a rambling, overly detailed account of daily use across many weeks, covering setup, " +
        "first impressions, comparisons to prior products I've owned, the weather that week, my dog's " +
        "opinion of the delivery truck, and other tangents that make this review far longer than it " +
        "needs to be. ";
    const defectSentence = "About three weeks in, the app pairing stopped working entirely, which was frustrating. ";

    // Pad with filler until oversized, inserting the defect sentence partway through
    // so it lands in a LATER chunk than the product/rating (which are in the opener).
    let body = opener;
    while (body.length < OVERSIZED_CHAR_THRESHOLD * 0.6) body += filler;
    body += defectSentence;
    while (body.length < OVERSIZED_CHAR_THRESHOLD + 800) body += filler;

    return body;
}

export function generateBatchDocuments(seed = 42) {
    const rng = mulberry32(seed);
    const docs = [];

    for (let i = 1; i <= 89; i++) {
        docs.push({ custom_id: `review-${String(i).padStart(3, "0")}`, text: normalDoc(rng, i), category: "normal" });
    }
    for (let i = 90; i <= 93; i++) {
        docs.push({ custom_id: `review-${String(i).padStart(3, "0")}`, text: oversizedDoc(rng, i), category: "oversized" });
    }
    docs.push({ custom_id: "review-094", text: "", category: "unfixable" });
    docs.push({ custom_id: "review-095", text: "   \n  ", category: "unfixable" });
    docs.push({ custom_id: "review-096", text: normalDoc(rng, 96), category: "expired" });
    docs.push({ custom_id: "review-097", text: normalDoc(rng, 97), category: "canceled" });
    for (let i = 98; i <= 100; i++) {
        docs.push({ custom_id: `review-${String(i).padStart(3, "0")}`, text: normalDoc(rng, i), category: "flaky" });
    }

    return docs;
}
