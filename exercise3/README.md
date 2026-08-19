# Exercise 3 — Structured Data Extraction Pipeline

Objective: practice designing JSON schemas, using `tool_use` for structured
output, implementing validation-retry loops, and designing batch processing
strategies. Node.js-based, API calls go straight from the client
using a local `.env` for the API key.

Domain chosen for all test documents: **product reviews**.

## Step 1 — Extraction tool schema

`extractionTool.js` defines the `extract_review_data` tool passed to the
Messages API via `tools` + `tool_choice: { type: "tool", name: "..." }`,
which forces every call to return structured arguments instead of free text.

Design decisions:

- **Required fields** (`product_name`, `rating`, `sentiment`, `defect_type`):
  chosen because a review, by definition, always expresses these — even if
  only implicitly.
- **Optional + nullable fields** (`reviewer_name`, `review_date`,
  `purchase_verified`, `would_recommend`): these often aren't disclosed in a
  review, so they're typed as e.g. `["string", "null"]` rather than merely
  omittable. Nullable-and-present was chosen over optional-and-omittable
  because Claude is more reliable at explicitly writing `null` when
  instructed to than at deciding on its own whether to omit a key —
  omission invites the model to "helpfully" fill something in instead.
- **Enum + "other" + detail pattern**: `defect_type` is a closed enum
  (`none`, `quality`, `shipping_damage`, `packaging`, `functionality`,
  `other`) paired with a sibling `defect_detail` string. A JSON Schema
  `if/then` clause requires `defect_detail` to be a non-null string only
  when `defect_type === "other"`. This keeps the field machine-sortable
  while not losing information that doesn't fit the closed categories.

### Verification: does the model fabricate absent data?

`testDocuments.js` holds reviews with deliberately varying completeness;
`testRunner.mjs` runs each through the tool and reports which fields came
back `null`. Result: across every case where information was genuinely
absent from the text (no reviewer name, no date, no stated recommendation,
no verified-purchase mention), the model correctly returned `null` instead
of guessing. Notably, a 4/5-star review with no explicit recommendation
statement returned `would_recommend: null` rather than inferring `true`
from the positive rating — proving sentiment and an explicit recommendation
were kept as distinct claims rather than conflated.

### Finding: a required, non-nullable field still got fabricated

An adversarial test document (`doc_adversarial_no_rating`) contained no
rating language at all — no stars, no "X/5". Because `rating` was
`required` and typed as plain `integer` (no `null` allowed), the model had
no legal way to express "unknown" under forced `tool_choice`, and it
fabricated `rating: 3`.

**Fix:** `rating` was changed to `type: ["integer", "null"]`. It stays in
`required` (the key must always be present), but the *value* is now allowed
to be null. Re-running the adversarial case after the fix returned
`rating: null` on the first attempt — no fabrication.

Lesson: `required` enforces key presence, not a non-null value. A field can
be both required and nullable, and that combination is often the correct
choice for information that's business-critical to have a slot for but not
guaranteed to appear in every source document.

## Step 2 — Validation-retry loop

`validator.mjs` compiles the tool's `input_schema` with `ajv` and validates
the model's `tool_use.input` against it. This is necessary because
`tool_use` guarantees the model *calls* the tool with arguments, but the API
does not itself enforce your JSON Schema constraints (enums, min/max,
`if/then`) at generation time — that check has to happen client-side.

`validationLoop.mjs` (`extractWithValidation`) implements the retry loop:

1. Extract, validate.
2. If invalid, send a followup turn containing the original document, the
   failed JSON, and the specific validation errors (path + message + rule).
   The model is told to fix only the flagged fields, and to use `null`
   (where the schema allows it) rather than guess if the source text
   doesn't support a valid value.
3. Re-validate. Repeat up to `maxRetries` (default 2) times.
4. **Classification is empirical, not inferred from error type alone**: an
   error present on attempt N and gone after the retry is logged as
   `resolvedErrors` (proof it was a format mistake — retry fixed it). An
   error still present on the same field after retries are exhausted is
   logged as `unresolvedErrors` with `reason: "information_absent_from_source"`
   (proof the model can't manufacture the fact no matter how clearly the
   error is explained).

Mechanically, the retry turn isn't a plain text follow-up: because the
model's prior turn included a `tool_use` block, the Messages API requires
the next turn to answer it with a matching `tool_result` block (same
`tool_use_id`) or the request 400s. `validationLoop.mjs` replays the
assistant's tool_use turn and answers it with a `tool_result` containing
the formatted validation errors — from the model's perspective this reads
like a failed tool execution telling it what went wrong, a pattern it
handles well.

### Verification

- **Real API run**, all 5 test documents: all succeeded on attempt 1, zero
  validation failures. This shows the schema + forced `tool_choice` do most
  of the correctness work upfront — the retry loop never had to fire in
  this run. Confirms the earlier schema fix worked: `doc_adversarial_no_rating`
  now returns `rating: null` cleanly instead of retrying or fabricating.
- **Deterministic mock test** (`validationLoop.test.mjs`): since the real
  run never exercised the retry path, this test scripts a fake Anthropic
  client to force three scenarios without hitting the API:
  - **Scenario A** — a `maximum` violation (`rating: 7`) fixed on the next
    attempt → correctly lands in `resolvedErrors`, `success: true`.
  - **Scenario B** — an `if/then` violation (`defect_type: "other"` with
    `defect_detail: null`) that never gets fixed across 3 attempts →
    correctly exhausts retries and lands in `unresolvedErrors` tagged
    `information_absent_from_source`. (Note: `ajv`'s `allErrors: true`
    reports both the nested type error and the wrapping `if` keyword
    failure for a single conditional failure, so this scenario produces 2
    unresolved error entries, not 1 — worth knowing so the count isn't
    mistaken for a bug.)
  - **Scenario C** — valid on the first attempt (control case) → no retry,
    nothing to resolve.
  - All 15 assertions passed.

Lesson: the validation-retry loop is a safety net for genuine format
mistakes, not a substitute for correct schema design. Once `rating` was
made nullable, the schema itself prevented the fabrication — the retry loop
was never needed for that case. The loop earns its place for the failures a
schema *can't* prevent by construction (e.g. the model forgetting
`defect_detail` when it picks `"other"`).

## Step 3 — Few-shot examples for structural variety

`fewShotExamples.mjs` injects real prior conversation turns before the
actual query — user doc → assistant `tool_use` call → user `tool_result`
turn — rather than describing examples in prose inside the tool's
`description`. Demonstrating by example, in the same tool_use modality the
model has to reproduce, is the standard approach and generally more
reliable than asking the model to translate a written description into
action. `validationLoop.mjs` accepts an `opts.fewShotMessages` array,
prepended before the real query.

Two example shapes were taught, distinct from anything in the step 1/2 test
set (all narrative prose so far):

1. **Labeled/bulleted review** (`Product:` / `Rating:` / `Pros:` / `Cons:` —
   closer to a table than prose, fields explicitly labeled).
2. **Buried-facts forum post** — rating and verdict are terse and appear
   mid-post (TL;DR-style) surrounded by narrative tangents and signature
   text unrelated to the review, mirroring "inline citation scattered in
   text vs. collected in a bibliography."

One bug caught before delivery: the first draft of example 2 set
`product_name: null` to demonstrate an unstated product name, but the
schema's `product_name` field is `{ type: "string" }` (not nullable) — that
example would have taught an invalid pattern and failed its own
validation. Fixed by rewriting the example text so the product name is
naturally stated instead.

### Verification: does few-shot measurably improve structural handling?

`comparisonRunner.mjs` runs each document in `structuralVarietyDocuments`
twice — once with zero few-shot examples (baseline), once with the
few-shot turns injected — and diffs the two extractions field by field, so
a real difference (or lack of one) is visible rather than assumed. Three
documents were tested, using different products/wording than the few-shot
examples themselves (testing generalization, not memorization):

- **`doc_labeled_table`** (labeled/bulleted format): baseline and few-shot
  extractions were identical. Baseline already parsed the labeled format
  correctly on its own.
- **`doc_buried_facts`** (casual forum post, rating/verdict unlabeled):
  baseline and few-shot extractions were identical.
- **`doc_adversarial_html_sarcasm_decoy`** (constructed to be genuinely
  hard: scraped HTML/table noise, a stated 5-star rating directly
  contradicted by sarcastic prose, and a decoy second product with its own
  4.8 rating mentioned in a "customers also liked" sidebar): baseline and
  few-shot extractions were identical. Baseline correctly kept
  `product_name` on the real product (didn't leak the decoy Mug's rating),
  kept `rating: 5` literal per the schema's "don't infer rating from tone"
  instruction, and correctly resolved the sarcasm into `sentiment:
  "negative"` and `would_recommend: false`.

**Finding: few-shot examples produced no measurable improvement across all
three structural variants tested, including the deliberately adversarial
one.** This is a legitimate, useful result rather than a failed exercise:
it shows few-shot only earns its keep when a model is actually struggling
with a format or convention it hasn't internalized, and Sonnet's baseline
instruction-following — combined with a well-specified schema whose tool
description already says "don't infer a rating from sentiment" — was
already strong enough that none of these structural challenges exposed a
gap for examples to close. A weaker/cheaper model (e.g. Haiku) would be a
more promising place to look for a case where few-shot visibly changes the
outcome, since baseline instruction-following is weaker there and leaves
more room for examples to move the needle. Not tested here — noted as a
possible follow-up rather than assumed.

## Step 4 — Batch processing strategy (100 documents)

Built and verified against a scripted mock of the Messages Batches API
surface (`client.messages.batches.create/retrieve/results`), not the real
API — deterministic, free, and doesn't require actually waiting on a
(possibly 24-hour) real batch window. The mock is interface-compatible with
the real SDK on purpose (see `REAL_USAGE_NOTES` at the bottom of
`batchPipeline.mjs`): swapping in `new Anthropic({apiKey}).messages.batches`
is a one-line change, not a rewrite.

**Document mix (100, seeded/reproducible via `batchDocuments.mjs`):** 89
normal reviews, 4 deliberately oversized documents, 2 empty/whitespace
documents, 1 document that simulates a `result.type: "expired"` result
(batch hit its 24h window before reaching it) on first submission, 1
document that simulates `result.type: "canceled"` (never recovers — see
below), and 3 documents that fail with a transient error the first time and
succeed unchanged on resubmission.

**Failure classification by `custom_id`** (`batchErrorClassifier.mjs`) —
three remediation paths, determined from the batch result's error type/message
rather than assumed from context:

- **Transient** (`overloaded_error`, etc.) → resubmit unchanged.
- **Oversized** (`invalid_request_error` matching "prompt is too long") →
  chunk (`chunking.mjs`, paragraph/sentence-boundary aware) and resubmit
  each chunk under a derived `custom_id` (`review-092::chunk1`, etc.), then
  merge.
- **Unfixable** (empty/non-empty-content rejection, or any other
  `invalid_request_error`) → flagged for human review, never resubmitted.
  An empty document is a genuine dead end — no amount of retrying produces
  content that was never there, the same lesson as step 1/2's fabrication
  finding but at the batch-request level instead of the field level.

**Merge policy for chunked documents:** first non-null value per field wins
across a document's chunks, but any field where chunks *disagree* is
recorded in a `conflicts` list rather than silently resolved — because a
disagreement means one chunk saw information the other didn't (or
mis-classified something), and picking one value silently could be actively
wrong rather than merely uncertain.

**SLA accounting** (`slaTracker.mjs`) — target: 4 hours. Important framing:
the Batches API's own guarantee is completion within 24 hours, not any
shorter window, so a tighter business SLA is really a promise about the
*pipeline's* design, not the Batches API alone. Round 1 and round 2 are
sequential (round 2 can't start until round 1's failures are known);
before submitting round 2, the pipeline checks the remaining time budget
against a conservative estimate of how long another batch round-trip might
take (120 min), and falls back to the **synchronous** Messages API for
round 2 if a second batch round-trip wouldn't plausibly fit — more
expensive per request, but the only way to protect a tight SLA once one
batch round has already used up most of it.

### Verification (mock run, `node batchRunner.mjs`)

- **Round 1**: 89 succeeded, 4 transient, 4 oversized, 3 unfixable, in a
  simulated 2h 45m (deliberately long, to eat most of the 4h budget and
  force the round-2 decision to actually matter).
- **Round 2 decision**: ~1h 15m of budget remained, less than the 120-min
  assumed batch round-trip cost, so the pipeline correctly chose the
  **synchronous fallback** (24 requests: 4 transient retries + 20 chunk
  requests from the 4 oversized documents) instead of blindly submitting
  another batch. Had it used another batch instead (~130 simulated
  minutes), total time would have landed around 4h 55m — a real SLA
  breach. The fallback kept the actual total at 2h 46m, comfortably inside
  the 4h target (margin +1h 14m).
- **Merge conflicts**: all 4 chunked documents correctly flagged a
  `defect_type` conflict — `"none"` from the chunk that only saw the
  product/rating, `"functionality"` from the chunk containing the buried
  defect sentence ("app pairing stopped working"). This is the merge logic
  working as intended: silently taking the first chunk's `"none"` would
  have been actively wrong, not just uncertain, so it surfaces as a flagged
  conflict instead.
- **Final tallies**: 97/100 successfully extracted, 3/100 (the empty,
  whitespace-only, and canceled documents) permanently unfixable and
  routed to human review, never resubmitted.

Two bugs caught and fixed before/during delivery:

1. The first draft of the oversized test documents' filler text included
   the words "packaging" and "box" (as in "thoughts on the packaging... the
   box it came in"), which falsely matched the `packaging` defect-keyword
   regex in every repeated filler paragraph and masked the `defect_type`
   conflict the test was built to demonstrate — every merged document
   showed a clean, conflict-free `"packaging"` result that looked plausible
   but wasn't actually exercising the interesting code path. Caught by
   checking for the expected `CONFLICTS` output rather than assuming a
   clean report meant success.
2. The first draft of `mockBatchClient.mjs` was written from training
   knowledge of the Batches API rather than a live doc check, and got two
   things wrong: it invented a `request_counts: { total }` field that
   doesn't exist on the real API (the real shape is per-status —
   `{processing, succeeded, errored, canceled, expired}`), and its result
   classification only handled two result types (`succeeded`/`errored`),
   missing that the real API has four (`succeeded`, `errored`, `canceled`,
   `expired`) — the latter two carry no `error` object at all, which the
   original `batchErrorClassifier.mjs` would have mishandled. Caught when
   asked directly what the mock was based on; fixed by fetching
   `https://platform.claude.com/docs/en/build-with-claude/batch-processing`
   live and correcting `request_counts`, adding explicit `"canceled"`/
   `"expired"` handling to `classifyBatchError`, and adding one document of
   each kind (`review-096` expired, `review-097` canceled) to
   `batchDocuments.mjs` so both branches are actually exercised by a run
   instead of just being reachable-in-theory dead code. Both fixes were
   verified by a dry run before being sent, and the live run's output
   matched the dry run exactly. Lesson: for anything API-shape-specific,
   verify against current docs before writing the mock, not after being
   asked to justify it — this whole correction cycle was avoidable with a
   docs check up front, and the same "verify, don't assume" principle used
   for extraction test data throughout this exercise applies just as much
   to how the exercise's own tooling is built.

## Step 5 — Human review routing via field-level confidence

Extends the exercise beyond its original 4 steps. Two confidence signals
were built and compared head-to-head against real ground truth, rather than
picking one on theory alone — an earlier framing in this conversation
argued self-consistency was the more "principled" choice (it measures real
sampling behavior rather than the model's opinion of itself), but that
theoretical argument turned out to be incomplete once tested.

**Two independent signals, both implemented (`selfConsistency.mjs`,
`selfReportedConfidence.mjs`):**

- **Self-consistency** — 3 independent extraction calls per document;
  a field is flagged low-confidence if the 3 samples disagree; the final
  value is the majority vote. Cost: 3x API calls.
- **Self-reported** — 1 call, using a companion tool schema
  (`extractionToolWithConfidence.mjs`) where the model rates its own
  per-field confidence (`high`/`medium`/`low`, with `medium` collapsed to
  "flagged" — a field the model itself says it had to infer rather than
  read directly is exactly what a reviewer should double check). Cost: 1x
  API call, same as a normal extraction.

**Ground truth** (`groundTruthDocuments.mjs`): 24 hand-authored documents,
6 each across the four structural types from steps 1/3 (narrative,
labeled/bulleted, buried-facts, adversarial HTML+sarcasm+decoy), each with
an exact expected extraction — verified by hand against the text, not
derived from the same logic that would grade it (unlike step 4's mock,
which would have trivially "passed" against itself).

**Routing policy** (`reviewRouter.mjs`): if ANY field comes back
low-confidence, the whole document routes to human review — a reviewer
checking one flagged field needs the document's context anyway, so
per-field-only review isn't actually cheaper, just more fragmented. The
specific flagged fields are still reported so the reviewer knows what to
focus on.

**Accuracy analysis** (`accuracyAnalysis.mjs`) reports three things per
run: accuracy by field, accuracy by document type, and — the check that
actually justifies (or doesn't) the whole routing strategy — a
precision/recall calibration of whether "flagged low-confidence" predicts
"actually wrong."

### Findings (real API, `confidenceComparisonRunner.mjs`, 96 calls total)

- **Self-reported caught more real errors than self-consistency, at the
  cost of more false alarms.** Self-consistency: 20% recall / 66.7%
  precision. Self-reported: 46.2% recall / 42.9% precision. Self-reported
  more than doubled the catch rate of actual mistakes, which cuts against
  the "self-consistency is the more principled signal" argument this step
  started with — theory said self-consistency should win; the actual
  ground-truth comparison said self-reported caught more.
- **Self-consistency's flag is itself non-deterministic run to run** — the
  most important finding of this step. Re-running the same ground truth
  set produced different catch/miss outcomes on the same documents: e.g.
  `gt-adversarial-01`'s disagreement was caught as a clean true positive in
  one run (2 samples said `"quality"`, one said `"other"`), then in a later
  run all 3 samples happened to land on the same wrong answer and it wasn't
  flagged at all. A routing decision built on whether 3 independent samples
  happen to agree is a coin-flip on borderline cases, not a stable signal
  from any single run — this needs averaging over many runs to trust, not
  one-shot evaluation.
- **A single document can dominate a document-type's reported accuracy at
  this sample size.** `gt-buried-02` alone accounted for 6 of self-reported
  confidence's 13 total wrong fields in one run (self-consistency got that
  same document almost entirely right), which is most of what dragged the
  `buried` document type down to 85.2% for that run. With only 6 documents
  per type, one anomalous response swings a whole category's number — the
  per-document-type breakdown should be read as suggestive with this
  sample size, not conclusive.
- **The two signals catch genuinely different errors** — several fields in
  the head-to-head comparison were caught by exactly one method and missed
  by the other (e.g. `gt-adversarial-03`'s `defect_type` error: caught by
  self-reported, missed by self-consistency; `gt-adversarial-05`'s
  `defect_type` error: caught by self-consistency in one run, missed by
  self-reported). Neither signal alone is reliable enough to fully trust,
  and a production system would likely want both, combined (e.g. route on
  either flagging — better recall, more reviewer load — or route only when
  both agree — better precision, more silent misses). Not implemented here;
  noted as the natural next step rather than built out further.
- **Most "errors" traced back to two root causes that aren't really model
  failures**: ground truth labels I authored for `sentiment` were sometimes
  genuinely ambiguous between `neutral`/`mixed`/`negative` (a review with
  both a stated pro and con is defensibly either "neutral" or "mixed" — the
  model's answer wasn't wrong so much as my single "correct" label was too
  rigid), and `defect_type` misclassifications repeatedly landed on the
  fuzzy boundary between `"quality"` and `"functionality"` (a fast-draining
  battery or a loosening handle is arguably both). This is a schema/ground-truth
  design limitation more than an extraction reliability problem, and worth
  fixing in the taxonomy before trusting the accuracy numbers as a verdict
  on model quality.

## Files

| File | Purpose |
|---|---|
| `extractionTool.js` | Tool definition: name, description, `input_schema` |
| `testDocuments.js` | Sample reviews of varying completeness/structure, plus adversarial cases |
| `testRunner.mjs` | Runs all `testDocuments` through the real API + validation loop |
| `validator.mjs` | `ajv`-based JSON Schema validator for tool output |
| `validationLoop.mjs` | Validation-retry loop with resolved/unresolved classification; accepts optional few-shot turns |
| `validationLoop.test.mjs` | Deterministic mock-client test of the retry loop's classification logic |
| `fewShotExamples.mjs` | Few-shot example turns (labeled/bulleted + buried-facts formats) |
| `comparisonRunner.mjs` | Runs `structuralVarietyDocuments` baseline vs. with-few-shot and diffs the results |
| `batchDocuments.mjs` | Seeded generator for the 100-document batch (normal/oversized/unfixable/expired/canceled/flaky mix) |
| `fakeExtract.mjs` | Lightweight regex-based stand-in extractor used only by the mock batch client |
| `mockBatchClient.mjs` | Scripted, interface-compatible stand-in for `client.messages.batches` (+ sync `client.messages.create`) |
| `simulatedClock.mjs` | Fake clock so SLA timing can be tested without real waiting |
| `chunking.mjs` | Paragraph/sentence-aware document chunker + chunk `custom_id` helpers |
| `batchErrorClassifier.mjs` | Classifies a batch error into transient / oversized / unfixable |
| `slaTracker.mjs` | SLA constant + elapsed-time/margin calculation from batch timestamps |
| `batchPipeline.mjs` | Orchestrates round 1 → classify → SLA-aware round 2 (batch or sync) → merge → report |
| `batchRunner.mjs` | Entry point: runs the pipeline against the mock client and prints the report |
| `extractionFields.mjs` | Shared list of extraction field names (used by step 5's confidence modules) |
| `groundTruthDocuments.mjs` | 24 hand-labeled documents (6 per structural type) with exact expected extractions |
| `selfConsistency.mjs` | 3x-sampling confidence signal: flags a field low-confidence on sample disagreement |
| `extractionToolWithConfidence.mjs` | Tool schema variant with a self-rated `field_confidence` object |
| `selfReportedConfidence.mjs` | 1-call confidence signal: uses the model's own per-field self-rating |
| `reviewRouter.mjs` | Routes a whole document to human review if any field is flagged low-confidence |
| `accuracyAnalysis.mjs` | Accuracy by field/document type + precision/recall calibration of the confidence flag |
| `reviewRoutingRunner.mjs` | Entry point: self-consistency only, against the ground truth set |
| `confidenceComparisonRunner.mjs` | Entry point: runs both signals side by side and prints a head-to-head table |

## Exercise complete

All five steps done: schema design with required/nullable/enum-detail
patterns, a validation-retry loop with empirical resolvable-vs-unresolved
classification, few-shot examples for structural variety (with an honest
null-result finding), a batch processing strategy with custom_id-based
failure handling, chunk-and-resubmit, and SLA-aware fallback routing, and a
human review routing strategy comparing two confidence signals against real
ground truth — finding that neither is reliable alone, that self-consistency's
own flag is non-deterministic run to run, and that most apparent "errors"
traced back to genuine ambiguity in the schema's taxonomy and the ground
truth labels rather than model unreliability.
