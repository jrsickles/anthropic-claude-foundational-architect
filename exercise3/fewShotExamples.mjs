/**
 * Exercise 3, Step 3 — Few-shot examples for structural variety.
 *
 * These are injected as real prior conversation turns (user doc -> assistant
 * tool_use -> user tool_result "correct") before the actual query, rather
 * than described in prose inside the tool's `description`. Demonstrating by
 * example, in the same tool_use modality the model must reproduce, is more
 * reliable than asking the model to translate a written description into
 * action.
 *
 * All step 1/2 test documents were unstructured narrative prose. These two
 * examples teach two DIFFERENT document shapes:
 *   1. A labeled/bulleted review (Pros: / Cons: / Rating:) — closer to a
 *      table than prose, fields are explicitly labeled rather than woven
 *      into sentences.
 *   2. A "buried facts" forum-style post — the rating/verdict is terse and
 *      appears mid-post or as a sign-off (TL;DR-style), surrounded by
 *      narrative noise, tangents, and signature text unrelated to the review
 *      itself. This mirrors "inline citation vs. bibliography": the useful
 *      fact is scattered inside unrelated text rather than clearly labeled.
 */

export const fewShotExamples = [
    {
        text:
            "Product: Nova Watch X\n" +
            "Rating: 4/5\n" +
            "Pros: Sleek design, great battery life, easy to pair\n" +
            "Cons: Screen scratches easily, app crashes occasionally\n" +
            "Verified Purchase: Yes",
        extraction: {
            product_name: "Nova Watch X",
            rating: 4,
            sentiment: "positive",
            defect_type: "quality",
            defect_detail: null,
            reviewer_name: null,
            review_date: null,
            purchase_verified: true,
            would_recommend: null
        }
    },
    {
        text:
            "so I've had this Nova Watch X for like a month now lol. my dog " +
            "knocked it off the counter day 2 and it survived which was nice. " +
            "anyway the battery drains kind of fast if you leave bluetooth on " +
            "all the time, not a huge deal. my brother has the older model and " +
            "says his is better but idk. TL;DR 2/5, wouldn't buy again tbh. -- " +
            "sent from my phone",
        extraction: {
            product_name: "Nova Watch X",
            rating: 2,
            sentiment: "negative",
            defect_type: "other",
            defect_detail: "Battery drains quickly when Bluetooth is left on",
            reviewer_name: null,
            review_date: null,
            purchase_verified: null,
            would_recommend: false
        }
    }
];

/**
 * Converts fewShotExamples into the alternating user/assistant/user turns
 * expected by the Messages API, ready to prepend before the real query.
 */
export function buildFewShotMessages() {
    const messages = [];

    fewShotExamples.forEach((example, index) => {
        const toolUseId = `toolu_fewshot_${index}`;

        messages.push({
            role: "user",
            content: `Extract structured data from this product review:\n\n${example.text}`
        });

        messages.push({
            role: "assistant",
            content: [
                {
                    type: "tool_use",
                    id: toolUseId,
                    name: "extract_review_data",
                    input: example.extraction
                }
            ]
        });

        messages.push({
            role: "user",
            content: [
                {
                    type: "tool_result",
                    tool_use_id: toolUseId,
                    content: "Correct."
                }
            ]
        });
    });

    return messages;
}
