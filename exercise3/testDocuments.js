/**
 * Exercise 3, Step 1 — Sample reviews with deliberately varying completeness.
 * Use these to confirm the model returns null for absent fields instead of
 * fabricating a plausible-sounding value.
 */

export const testDocuments = [
    {
        id: "doc_full",
        label: "All fields present",
        text:
            "Reviewed by Maria T. on 2026-03-14. Bought the Aurora Blender Pro, " +
            "verified purchase. 5 stars, works great, would definitely recommend " +
            "to anyone who bakes a lot. No issues with mine, though I heard some " +
            "people got units with cracked lids."
    },
    {
        id: "doc_no_name_no_date",
        label: "Missing reviewer name and date",
        text:
            "3 stars for the Aurora Blender Pro. It's fine, does the job, nothing " +
            "special. Not sure I'd recommend it over cheaper alternatives."
    },
    {
        id: "doc_no_defect_no_recommend",
        label: "No defect mentioned, no recommend statement, no purchase verification",
        text:
            "The Aurora Blender Pro is a solid 4/5. Blends smoothies well, easy to clean."
    },
    {
        id: "doc_other_defect",
        label: "Defect present but doesn't fit standard categories",
        text:
            "1 star. The Aurora Blender Pro made a burning plastic smell after " +
            "10 minutes of light use and the app pairing (yes, this blender has " +
            "an app) never worked. Very disappointed, would not recommend."
    },
    {
        id: "doc_adversarial_no_rating",
        label: "ADVERSARIAL — no numeric/star rating anywhere, tests a REQUIRED field with no source data",
        text:
            "Got the Aurora Blender Pro last week. It's a blender. It blends things. " +
            "I have used it twice."
    }
];

/**
 * Step 3 — structurally varied documents, distinct products/wording from the
 * few-shot examples in fewShotExamples.mjs, used to test whether few-shot
 * generalizes to new instances of the same shapes rather than just being
 * memorized verbatim.
 */
export const structuralVarietyDocuments = [
    {
        id: "doc_labeled_table",
        label: "Labeled/bulleted review (table-like, not prose)",
        text:
            "Product: TrailBrew Camp Kettle\n" +
            "Rating: 5/5\n" +
            "Pros: Boils fast, packs flat, lid seals tight\n" +
            "Cons: Handle gets warm without the sleeve\n" +
            "Verified Purchase: Yes"
    },
    {
        id: "doc_buried_facts",
        label: "Buried facts in a casual forum-style post (rating/verdict not labeled up front)",
        text:
            "picked up the TrailBrew Camp Kettle for a trip last month, been " +
            "meaning to write this up forever lol. anyway it's whatever, does " +
            "what it says. the little rubber foot on the bottom fell off after " +
            "the second trip which was annoying since it's supposed to protect " +
            "the table. my buddy has the bigger one and likes his more. " +
            "3/5 honestly, probably wouldn't grab it again. -- sent from my phone"
    },
    {
        id: "doc_adversarial_html_sarcasm_decoy",
        label:
            "ADVERSARIAL — scraped HTML noise + a stated rating that contradicts sarcastic prose " +
            "+ a decoy second product with its own rating that must not leak into the extraction",
        text:
            '<div class="review-block">\n' +
            "  <table>\n" +
            "    <tr><td>Item</td><td>TrailBrew Camp Kettle</td></tr>\n" +
            "    <tr><td>Stars</td><td>5</td></tr>\n" +
            "  </table>\n" +
            "  <p>Oh sure, FIVE STARS, because nothing says \"quality camping gear\" like a kettle " +
            "that whistles so loud it woke up the entire campsite AND melted a little on one side " +
            'after the second use. Genuinely can\'t recommend this enough if your goal is a group ' +
            "chat full of angry friends.</p>\n" +
            "  <p>Customers who bought this also liked the TrailBrew Mug (4.8 stars, 200 reviews).</p>\n" +
            "</div>"
    }
];
