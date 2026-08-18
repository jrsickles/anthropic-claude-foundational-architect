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
