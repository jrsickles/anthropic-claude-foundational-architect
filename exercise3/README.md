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

## Files

| File | Purpose |
|---|---|
| `extractionTool.js` | Tool definition: name, description, `input_schema` |
| `testDocuments.js` | Sample reviews of varying completeness, plus one adversarial case |
| `testRunner.mjs` | Runs all `testDocuments` through the real API + validation loop |
| `validator.mjs` | `ajv`-based JSON Schema validator for tool output |
| `validationLoop.mjs` | Validation-retry loop with resolved/unresolved classification |
| `validationLoop.test.mjs` | Deterministic mock-client test of the retry loop's classification logic |

## Next: Step 3

Not yet started.
