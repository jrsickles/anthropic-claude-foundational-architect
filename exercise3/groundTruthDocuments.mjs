/**
 * Exercise 3, Step 5 — Hand-authored ground truth set for accuracy analysis.
 *
 * 24 documents, 6 per document type, each with an EXACT expected extraction
 * hand-verified against the text (not derived by the same regex logic that
 * would grade it, which is what made step 4's mock trivially "accurate").
 * This is real ground truth: if the model disagrees with `expected`, that's
 * a genuine extraction error, not a difference in how two pieces of code
 * happened to parse the same text.
 *
 * Document types mirror steps 1-3's structural variety, so the per-type
 * accuracy breakdown means something we've already built intuition for:
 *   - "narrative"   — unstructured prose (step 1's format)
 *   - "labeled"     — Product:/Rating:/Pros:/Cons: bulleted (step 3's format)
 *   - "buried"      — casual forum post, facts unlabeled/buried (step 3's format)
 *   - "adversarial" — HTML noise + sarcasm + decoy product (step 3's hardest case)
 */

export const groundTruthDocuments = [
    // ---- narrative (6) ----
    {
        id: "gt-narrative-01",
        docType: "narrative",
        text:
            "Reviewed by Priya K. on 2026-02-10. Bought the Aurora Blender Pro, verified purchase. " +
            "5 stars, works great, would definitely recommend to anyone who bakes a lot.",
        expected: {
            product_name: "Aurora Blender Pro", rating: 5, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: "Priya K.", review_date: "2026-02-10",
            purchase_verified: true, would_recommend: true
        }
    },
    {
        id: "gt-narrative-02",
        docType: "narrative",
        text: "3 stars for the TrailBrew Camp Kettle. It's fine, does the job, nothing special.",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 3, sentiment: "neutral", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-narrative-03",
        docType: "narrative",
        text:
            "1 star. The Nova Watch X stopped pairing with my phone after two days. Bluetooth just " +
            "won't connect anymore. Very disappointed, would not recommend.",
        expected: {
            product_name: "Nova Watch X", rating: 1, sentiment: "negative", defect_type: "functionality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: false
        }
    },
    {
        id: "gt-narrative-04",
        docType: "narrative",
        text:
            "Got the Solstice Desk Lamp last week. It's a lamp. It lights up my desk. Used it every " +
            "day so far, no complaints.",
        expected: {
            product_name: "Solstice Desk Lamp", rating: null, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-narrative-05",
        docType: "narrative",
        text:
            "Reviewed by Tom on 2026-01-22. Aurora Blender Pro arrived with a visible crack down one " +
            "side. 2/5. Verified purchase. Contacted support, still waiting.",
        expected: {
            product_name: "Aurora Blender Pro", rating: 2, sentiment: "negative", defect_type: "shipping_damage",
            defect_detail: null, reviewer_name: "Tom", review_date: "2026-01-22",
            purchase_verified: true, would_recommend: null
        }
    },
    {
        id: "gt-narrative-06",
        docType: "narrative",
        text:
            "TrailBrew Camp Kettle, 4 stars. The box it shipped in was crushed but the kettle itself " +
            "was fine. Would recommend, just wish the packaging was sturdier.",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 4, sentiment: "positive", defect_type: "packaging",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: true
        }
    },

    // ---- labeled (6) ----
    {
        id: "gt-labeled-01",
        docType: "labeled",
        text:
            "Product: Nova Watch X\nRating: 5/5\nPros: Sleek design, great battery life, easy to pair\n" +
            "Cons: none\nVerified Purchase: Yes",
        expected: {
            product_name: "Nova Watch X", rating: 5, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: true, would_recommend: null
        }
    },
    {
        id: "gt-labeled-02",
        docType: "labeled",
        text:
            "Product: Solstice Desk Lamp\nRating: 2/5\nPros: Bright enough\nCons: Flickers randomly, " +
            "app pairing for dimming never worked\nVerified Purchase: No",
        expected: {
            product_name: "Solstice Desk Lamp", rating: 2, sentiment: "negative", defect_type: "functionality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: false, would_recommend: null
        }
    },
    {
        id: "gt-labeled-03",
        docType: "labeled",
        text:
            "Product: Aurora Blender Pro\nRating: 3/5\nPros: Blends smoothies fine\nCons: Handle feels " +
            "cheap and got slightly warm after long use\nVerified Purchase: Yes",
        expected: {
            product_name: "Aurora Blender Pro", rating: 3, sentiment: "neutral", defect_type: "quality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: true, would_recommend: null
        }
    },
    {
        id: "gt-labeled-04",
        docType: "labeled",
        text:
            "Product: TrailBrew Camp Kettle\nRating: 4/5\nPros: Boils fast, packs flat\nCons: none\n" +
            "Verified Purchase: Yes",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 4, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: true, would_recommend: null
        }
    },
    {
        id: "gt-labeled-05",
        docType: "labeled",
        text:
            "Product: Nova Watch X\nRating: 1/5\nPros: none that I found\nCons: Arrived in a torn box, " +
            "screen was scratched out of the package\nVerified Purchase: Yes",
        expected: {
            product_name: "Nova Watch X", rating: 1, sentiment: "negative", defect_type: "shipping_damage",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: true, would_recommend: null
        }
    },
    {
        id: "gt-labeled-06",
        docType: "labeled",
        text:
            "Product: Solstice Desk Lamp\nRating: 5/5\nPros: Great value, easy setup, love the warm " +
            "light\nCons: none\nVerified Purchase: Yes",
        expected: {
            product_name: "Solstice Desk Lamp", rating: 5, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: true, would_recommend: null
        }
    },

    // ---- buried (facts unlabeled, casual tone) (6) ----
    {
        id: "gt-buried-01",
        docType: "buried",
        text:
            "picked up the TrailBrew Camp Kettle for a trip last month. anyway it's whatever, does " +
            "what it says. the rubber foot fell off after the second trip. 3/5 honestly, probably " +
            "wouldn't grab it again.",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 3, sentiment: "negative", defect_type: "quality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: false
        }
    },
    {
        id: "gt-buried-02",
        docType: "buried",
        text:
            "so I've had this Nova Watch X for like a month now lol. battery drains kind of fast if " +
            "you leave bluetooth on all the time. TL;DR 4/5, pretty happy overall.",
        expected: {
            product_name: "Nova Watch X", rating: 4, sentiment: "positive", defect_type: "quality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-buried-03",
        docType: "buried",
        text:
            "the Aurora Blender Pro is fine I guess?? my roommate has a nicer one. mine's never given " +
            "me trouble at least. sent from my phone",
        expected: {
            product_name: "Aurora Blender Pro", rating: null, sentiment: "neutral", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-buried-04",
        docType: "buried",
        text:
            "ok so the Solstice Desk Lamp showed up and the base was cracked right out of the box, " +
            "kind of annoying tbh. exchanged it for a new one and that one's been fine. 3/5 for the " +
            "hassle.",
        expected: {
            product_name: "Solstice Desk Lamp", rating: 3, sentiment: "negative", defect_type: "shipping_damage",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-buried-05",
        docType: "buried",
        text:
            "not gonna lie the TrailBrew Camp Kettle exceeded expectations, boils water crazy fast. " +
            "would 100% recommend to anyone camping this summer. 5 stars from me",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 5, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: true
        }
    },
    {
        id: "gt-buried-06",
        docType: "buried",
        text:
            "the app for the Nova Watch X crashes literally every time I try to change the watch " +
            "face, so frustrating. everything else about it is solid though. 2/5 just because of that",
        expected: {
            product_name: "Nova Watch X", rating: 2, sentiment: "negative", defect_type: "functionality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },

    // ---- adversarial (HTML noise + sarcasm + decoy product) (6) ----
    {
        id: "gt-adversarial-01",
        docType: "adversarial",
        text:
            '<div class="review-block"><table><tr><td>Item</td><td>TrailBrew Camp Kettle</td></tr>' +
            "<tr><td>Stars</td><td>5</td></tr></table>" +
            '<p>Oh sure, FIVE STARS, because nothing says "quality camping gear" like a kettle that ' +
            "whistles so loud it woke up the entire campsite AND melted a little on one side. " +
            "Genuinely can't recommend this enough if your goal is angry friends.</p>" +
            "<p>Customers who bought this also liked the TrailBrew Mug (4.8 stars, 200 reviews).</p></div>",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 5, sentiment: "negative", defect_type: "quality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: false
        }
    },
    {
        id: "gt-adversarial-02",
        docType: "adversarial",
        text:
            '<div class="review"><table><tr><td>Product</td><td>Nova Watch X</td></tr>' +
            "<tr><td>Rating</td><td>4</td></tr></table>" +
            "<p>Solid watch overall, no complaints on build quality. Battery life is what you'd expect.</p>" +
            "<p>Frequently bought together: Nova Watch Charging Dock (3.9 stars).</p></div>",
        expected: {
            product_name: "Nova Watch X", rating: 4, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-adversarial-03",
        docType: "adversarial",
        text:
            '<table><tr><td>Item</td><td>Aurora Blender Pro</td></tr><tr><td>Stars</td><td>1</td></tr></table>' +
            "<p>Wow, one star, truly a triumph of engineering — it caught a faint burning smell after " +
            "ten minutes and I can't recommend it to literally anyone.</p>" +
            "<p>Also popular: Aurora Mini Blender (4.6 stars, 88 reviews).</p>",
        expected: {
            product_name: "Aurora Blender Pro", rating: 1, sentiment: "negative", defect_type: "quality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: false
        }
    },
    {
        id: "gt-adversarial-04",
        docType: "adversarial",
        text:
            '<div><table><tr><td>Product</td><td>Solstice Desk Lamp</td></tr>' +
            "<tr><td>Rating</td><td>5</td></tr></table>" +
            "<p>Genuinely great lamp, does exactly what it says, warm light, easy setup. No notes.</p>" +
            "<p>You might also like: Solstice Floor Lamp (4.2 stars).</p></div>",
        expected: {
            product_name: "Solstice Desk Lamp", rating: 5, sentiment: "positive", defect_type: "none",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-adversarial-05",
        docType: "adversarial",
        text:
            '<table><tr><td>Item</td><td>TrailBrew Camp Kettle</td></tr><tr><td>Stars</td><td>2</td></tr></table>' +
            "<p>Handle came loose after the third use, kind of a pain to tighten back up in the field.</p>" +
            "<p>Related: TrailBrew Mug Set (4.5 stars, 60 reviews).</p>",
        expected: {
            product_name: "TrailBrew Camp Kettle", rating: 2, sentiment: "negative", defect_type: "quality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: null
        }
    },
    {
        id: "gt-adversarial-06",
        docType: "adversarial",
        text:
            '<div class="review-block"><table><tr><td>Item</td><td>Nova Watch X</td></tr>' +
            "<tr><td>Stars</td><td>5</td></tr></table>" +
            "<p>Oh yeah, absolutely FIVE STARS, love how the app crashes every single morning right when " +
            "I need it. Truly can't recommend this enough to anyone who enjoys frustration.</p>" +
            "<p>Customers also viewed: Nova Watch SE (4.3 stars, 150 reviews).</p></div>",
        expected: {
            product_name: "Nova Watch X", rating: 5, sentiment: "negative", defect_type: "functionality",
            defect_detail: null, reviewer_name: null, review_date: null,
            purchase_verified: null, would_recommend: false
        }
    }
];
