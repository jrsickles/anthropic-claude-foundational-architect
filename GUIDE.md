# Claude Certified Architect (Foundations) — Exam Prep Guide

Consolidated summary of the four hands-on exercises completed while preparing for the
Claude Certified Architect – Foundations certification. Source material: the four
`exerciseN/README.md` files in this project (each an incremental, step-by-step log
written as the exercise progressed).

---

## Exercise 1 — Multi-Tool Agent with Escalation Logic

**Stack:** Vue 3 + Vite, no backend, hand-rolled agentic loop against the Anthropic
Messages API (`@anthropic-ai/sdk`, `dangerouslyAllowBrowser` since the key ships
client-side by necessity in this exercise).

**What was built:**
- A layered architecture (`api/` → `agent/` → `tools/` → `composables/` → `components/`)
  where lower layers never depend on Vue, keeping them swappable/testable.
- Five tools: `check_order_status`, `check_account_balance`, `search_help_articles`,
  `escalate_to_human`, and `issue_refund` (added last, specifically to give the
  guardrail something state-changing to intercept).
- A hand-rolled agentic loop (`runAgentLoop.js`) that branches explicitly on
  `stop_reason`, caps turns at 5, and handles parallel `tool_use` blocks via
  `Promise.all`.
- Structured tool errors (`ToolError` with `errorCategory` + `isRetryable`) so the
  model can be told, via the system prompt, to retry transient failures once, ask for
  corrected input on validation failures, and offer escalation on permission failures
  — never blindly retrying everything.
- A **hard, code-enforced guardrail**: any `issue_refund` call over a threshold is
  intercepted in code before the real handler runs and silently swapped for
  `escalate_to_human` — deliberately not a prompt-only rule, so no phrasing could
  talk the model around it.

**Key decisions:**
- Tool descriptions, not documentation, are what the model uses to disambiguate
  similar tools — `check_order_status` and `check_account_balance` were written with
  explicit negative-boundary cross-references ("do NOT use this for billing...").
- Failed messages are kept in local history (flagged, excluded from the next API
  payload) rather than deleted, to preserve an honest chat log.
- The Messages API is stateless per request — full history must be resent every call.

**Assumptions / open questions (flagged, not resolved):**
- Where message metadata enrichment (timestamps, status) belongs — in the loop or as
  a decorating step in the composable — was left open.
- Structured `ToolError` handling was only implemented/tested on one tool
  (`checkOrderStatus.js`) as a reference pattern, deliberately not replicated
  everywhere.

**Verification / conclusions:**
- Confirmed genuine parallel tool calling (two lookups in one turn → two simultaneous
  `tool_call` events, not sequential).
- Confirmed emergent, non-coded caution: the model verified order status before
  acting on a refund request when both were mentioned together.
- Confirmed the guardrail holds under a complex 3-concern message (lookup + refund +
  frustration): correct decomposition, correct escalation, no false claim the refund
  succeeded, coherent final synthesis.
- Several real bugs were found and fixed during review (comparing the wrong name
  field, duplicate `tool_result` blocks, a parameter-shape mismatch swallowing
  progress events) — a reminder that testing the "happy path" alone hides orchestration
  bugs.

---

## Exercise 2 — Configuring Claude Code for a Team Development Workflow

**Objective:** practice CLAUDE.md hierarchies, path-specific rules, project skills,
MCP server config, and plan mode — all in a PHP project.

**Step 1 — Project CLAUDE.md:** committed to the repo root with coding standards
(PSR-12, `declare(strict_types=1)`) and testing conventions. The key property tested
and confirmed: it auto-loads for every developer who clones the repo (verified via
`claude --debug` startup logs), unlike personal-scope (`~/.claude/CLAUDE.md`) or
gitignored local overrides (`CLAUDE.local.md`).

**Step 2 — Path-specific rules (`.claude/rules/`):** two rule files with YAML
frontmatter `paths` globs (API conventions scoped to `src/api/**/*`, testing
conventions scoped to `**/*.test.*`). Verified rules load conditionally per matching
file (checked with `/memory`) and that new rule files require a session restart to be
discovered.

**Step 3 — Project-scoped skill:** a read-only `code-review` skill using
`context: fork` (runs as an isolated subagent, only final result returns) and
`allowed-tools: ["Read", "Grep", "Glob"]`. A deliberate negative test — asking the
skill to also fix what it found — correctly failed (it refused), clarifying that
`allowed-tools` scopes the *skill's subagent*, not the main session that consumes its
output (the main session then applied the fix itself, unrestricted).

**Step 4 — MCP server configuration:** a project-scoped `postgres` server in
`.mcp.json` (committed, credentials expanded from shell env vars, never hardcoded)
alongside a personal-scoped `experimental-notes` server in `~/.claude.json` (machine-
local, never shared). Encountered and resolved the project-MCP trust model: `.mcp.json`
servers require explicit per-project approval (silent no-load if undecided, since a
committed `.mcp.json` is a plausible supply-chain vector) — resolved via
`claude mcp reset-project-choices` + approving the live prompt. Verified both servers
connected simultaneously via `/mcp`, and that env var placeholders resolved to real
values.

**Step 5 — Plan mode vs. direct execution**, tested across three real tasks of
increasing ambiguity:
1. Single-file bug fix — low ambiguity, plan mode adds little.
2. Multi-file library migration — plan mode surfaced a genuine structural decision
   (repository interface vs. inline array) *before* code was written around the
   wrong abstraction.
3. New feature with multiple valid designs (rate limiting) — plan mode's clearest
   value: it distinguished a consequential/hard-to-reverse choice (deferred to the
   user) from a reversible one behind an interface seam (decided independently, with
   the tradeoff documented).

**Conclusion:** plan mode's value scales with ambiguity and blast radius, not raw
task size. Both multi-file plans executed cleanly with self-verifying regression
tests (break the fix, confirm the test fails, then revert) — 6/6 and 19/19 passing.

---

## Exercise 3 — Structured Data Extraction Pipeline

**Objective:** JSON schema design, `tool_use` for forced structured output,
validation-retry loops, few-shot examples, and batch processing strategy. Node.js,
domain = product reviews.

**Step 1 — Extraction tool schema:** required fields for what a review always
expresses (`product_name`, `rating`, `sentiment`, `defect_type`); optional fields
typed as nullable (e.g. `["string","null"]`) rather than omittable, because the model
is more reliable explicitly writing `null` than deciding on its own whether to omit a
key. An enum + "other" + detail sibling pattern (`defect_type` / `defect_detail`)
keeps data machine-sortable without losing information that doesn't fit closed
categories.
- **Key finding:** an adversarial document with no rating language caused the model
  to fabricate `rating: 3`, because `rating` was required *and* non-nullable, leaving
  the model no legal way to express "unknown" under forced `tool_choice`. **Fix:**
  made it `["integer","null"]` while keeping it required — required enforces key
  *presence*, not a non-null *value*. Fabrication disappeared after the fix.

**Step 2 — Validation-retry loop:** `tool_use` guarantees the model calls the tool,
not that its arguments satisfy the JSON Schema — client-side validation (`ajv`) is
still necessary. The retry loop resends the original doc + failed JSON + specific
validation errors as a `tool_result` answering the prior `tool_use_id` (required by
the API's turn-taking rules). Classification is empirical: an error that disappears
after retry is `resolvedErrors` (real format mistake); one that persists is
`unresolvedErrors` tagged `information_absent_from_source` (the model can't
manufacture a fact no matter how the error is explained). Real API run: all 5 test
docs passed on attempt 1 (retry path unexercised); a separate deterministic mock test
exercised all 3 retry scenarios explicitly (15/15 assertions passed).

**Step 3 — Few-shot examples:** injected as real prior turns (user doc → assistant
`tool_use` → user `tool_result`), not prose in the tool description, since
demonstrating in the same modality the model must reproduce is more reliable.
**Finding: few-shot produced no measurable improvement** across three structural
variants, including a deliberately adversarial one — a legitimate negative result
showing Sonnet's baseline instruction-following, combined with a well-specified
schema, was already sufficient; few-shot's value is likely to show up on a weaker
model (e.g. Haiku), noted as an untested follow-up rather than assumed.

**Step 4 — Batch processing strategy (100 docs):** built against a scripted,
interface-compatible mock of the Messages Batches API (swap to the real SDK is a
one-line change). Failure classification by `custom_id` into transient (resubmit),
oversized (chunk + resubmit + merge), and unfixable (route to human, never
resubmit). Merge policy: first non-null value wins per field, but disagreeing values
across chunks are flagged as `conflicts` rather than silently resolved. SLA tracking
(4h target vs. the Batches API's own 24h guarantee) with a synchronous fallback if a
second batch round-trip wouldn't fit the remaining budget — verified this decision
actually mattered (would have caused an SLA breach if a second batch had been used
instead). Two real bugs were caught and fixed during this step: filler text
accidentally matching a defect keyword and masking the intended conflict scenario,
and a mock client written from training-data assumptions about the Batches API rather
than a live docs check (wrong `request_counts` shape, missing `canceled`/`expired`
result types) — fixed by fetching the live docs. **Lesson: verify API shapes against
current docs before building test tooling, not after being asked to justify it.**

**Step 5 — Human review routing via confidence (extension beyond the original 4
steps):** two independent confidence signals built and compared against 24
hand-authored ground-truth documents — self-consistency (3x sampling, flag on
disagreement, 3x cost) vs. self-reported confidence (1 call, model rates its own
per-field confidence, 1x cost). **Findings:** self-reported caught more real errors
(46.2% recall / 42.9% precision) than self-consistency (20% recall / 66.7%
precision), reversing the a priori theoretical expectation that self-consistency
would be more "principled." Self-consistency's own flag was found to be
non-deterministic run-to-run on the same documents — the most important finding of
the step. The two signals catch different errors (neither is reliable alone). Most
apparent "errors" traced back to genuine ambiguity in the ground-truth labels and
taxonomy, not model unreliability — a schema/labeling limitation, not a model quality
verdict.

---

## Exercise 4 — Multi-Agent Research Pipeline (Orchestration)

**Stack:** Python + the official Claude Agent SDK (chosen over PHP because the
exercise's vocabulary — `allowedTools`, `Task`, subagent definitions — is SDK-specific
and only ships for Python/TypeScript).

**Step 1 — Coordinator + two subagents:** `web-researcher` (`WebSearch`,`WebFetch`)
and `document-analyzer` (`Read`,`Grep`,`Glob`), each least-privilege scoped; the
coordinator itself is scoped to only `Task` (can delegate, can't do the work itself).
Findings are passed **explicitly** through subagent prompt text, because subagents
spawned via `Task` do **not** automatically inherit the coordinator's conversation
history — each call starts a fresh context. **Bug found:** every tool call was denied
with `permission_denied` on the first run, because `allowed_tools` in the Agent SDK is
the auto-approve list for the *interactive* permission prompt, not a hard scoping
mechanism — with no terminal to approve prompts in a non-interactive script, every
call was denied by default. Fixed with `permission_mode="bypassPermissions"`, safe
here because least-privilege is already enforced per-subagent via each one's own
`tools` list. Also switched the coordinator's model from Opus to Sonnet after Opus's
reasoning turns dominated cost (~$2.03 of $2.69); Sonnet dropped the equivalent run to
~$0.57 of $0.90.

**Step 2 — Parallel vs. sequential, with latency measurement:** noticed before coding
that `document-analyzer` has a genuine data dependency on `web-researcher` and can
never be fairly parallelized with it — added a new, independent `recency-checker`
subagent instead, so a real parallel opportunity exists without breaking the real
dependency. Measured on Haiku (pasture maintenance topic): parallel was ~39% faster
(106s vs 175s) and ~34% cheaper — though the cost gap is a secondary effect of the
sequential run's subagents doing more searching, not a mechanical property of
parallelism itself. **Precision noted for the exam:** checking the raw transcript,
the coordinator did *not* literally place two `Task` calls in one assistant turn —
each delegation was its own turn. The real speedup came from the SDK's task scheduler
starting the second subagent while the first was still running (concurrent execution
at the scheduling level), not literal same-turn parallel tool_use blocks.

**Step 3 — Structured findings with verified provenance:** every subagent returns a
JSON array of `{claim, evidence_excerpt, source, publication_date}` objects (content
vs. metadata separation); the coordinator's synthesis re-emits the same fields
byte-for-byte plus a `source_agent` tag, rather than paraphrasing into prose (which
would destroy provenance). Verification is automated (`verify_attribution()`), not
eyeballed. Result: 33/33 findings preserved unchanged through the merge. Flagged
caveat: a clean pass doesn't independently prove the *original* dates were faithful
to the source text — only that they round-tripped unchanged through the merge.

**Step 4 — Error propagation (simulated timeout):** a real per-call timeout can't be
injected from outside the SDK, so failure was simulated via a prompt instructing one
subagent to make exactly one tool call, then return a structured
`{failure_type, attempted_query, partial_results, error_message}` object. Coordinator
instructions were extended (not replaced) to treat this as non-fatal: continue with
whichever subagents succeeded, fold `partial_results` into merged findings, and
annotate `coverage_gaps` in the synthesis JSON. **Bug found:** the first attempt (on
Haiku) simply ignored the simulated-failure instruction and did the real task instead
— the same instruction-following gap seen elsewhere; switching to Sonnet fixed it
cleanly. Verified run: structured error received, coverage gap annotated correctly,
partial results (2/2) carried into final findings, and — notably — the dependent
`document-analyzer` still completed real cross-check work against the partially
failed upstream input rather than halting.

**Step 5 — Conflicting source data:** attempted the same simulate-and-verify pattern
as Step 4, this time forcing two subagents to each return one fixed but
*contradictory* scripted statistic. **The simulation did not trigger, even on
Sonnet** — both subagents ignored the instruction and did genuine research instead.
This was accepted as the result rather than patched further. **Conclusion drawn:**
this is a different kind of failure than Step 4's instruction-following miss — Step
4 asked a model to admit failure (not in tension with its values); Step 5 asked it to
fabricate a statistic and attribute it to a nonexistent source, i.e. manufacture a
false citation. The likely explanation is the model's own alignment training
overriding an explicit test-harness instruction when that instruction asks it to
state something false as true. This is recorded as a real architectural limit on
how far prompt-level simulation can go for testing adversarial/contradictory-input
handling — not a defect in the coordinator's merge logic, which was simply never
exercised with genuine conflicting data.

---

## Cross-Exercise Themes Relevant to the Exam

- **Statelessness of the Messages API** (Ex.1, Ex.3): every call must carry full
  context; nothing persists server-side between calls.
- **`required` vs. nullable are orthogonal** (Ex.3): a field can be required (key
  must be present) while its value is nullable — the fix for forced-tool-choice
  fabrication when information is genuinely absent from a source.
- **Guardrails belong in code, not prompts, when they must be unconditional** (Ex.1):
  the refund-threshold interception is deterministic and cannot be argued around,
  unlike a prompt-only instruction.
- **Explicit context passing between agents/subagents** (Ex.4): subagents spawned via
  `Task` do not inherit conversation history automatically; findings must be copied
  into the next prompt explicitly.
- **`allowed_tools` / `allowed-tools` scope different things in different SDKs**
  (Ex.2 vs Ex.4): in Claude Code project skills it's a hard read-only restriction on
  the skill's own subagent; in the Agent SDK it's only the auto-approve list for the
  interactive permission prompt and does not by itself restrict tool availability —
  `permission_mode` / per-subagent `tools` lists are what actually scope access.
  This distinction is a good exam trap to watch for.
- **Model choice materially affects instruction-following on meta/orchestration
  instructions** (Ex.4 Steps 2, 4, 5): Haiku repeatedly deprioritized "pretend to
  fail" or "run sequentially" style meta-instructions in favor of the object-level
  task; Sonnet held to them more reliably (except when the instruction asked it to
  fabricate a false citation — see Step 5).
- **Verification should be automated and adversarial, not just a happy-path check**
  (Ex.1, Ex.3, Ex.4): every exercise's most useful findings came from deliberately
  broken/adversarial/edge-case test conditions (sentinel failure values, adversarial
  documents, simulated timeouts/conflicts), not from re-confirming the working case.
- **A clean pass is not full proof** (Ex.3 Step 4, Ex.4 Step 3): both exercises
  explicitly flag that a positive verification result (validation succeeded / 33-33
  attribution match) doesn't rule out a *different*, unmeasured failure mode (silent
  fabrication that happens to be self-consistent) — worth stating as a limitation
  rather than treating pass rates as final proof.
- **Negative/null results are legitimate exercise outcomes** (Ex.3 Step 3 few-shot,
  Ex.4 Step 5 conflict simulation): both were reported honestly as "did not show the
  expected effect" rather than iterated on until a positive result appeared, with
  reasoning for *why* the negative result is informative.

---

## Gap Analysis vs. the Official Exam Guide

This section is now based on a direct read of the official exam guide PDF (**Version
0.2, last updated June 30 2026**) — 60 questions, 120 minutes, 4 scenarios drawn from
a bank of 6, scaled scoring 100–1000 with a passing score of 720. It replaces the
earlier third-party-sourced version of this section.

**Exam structure:** each of the 6 possible scenarios (Customer Support Resolution
Agent, Code Generation with Claude Code, Multi-Agent Research System, Developer
Productivity with Claude, Claude Code for Continuous Integration, Structured Data
Extraction) maps to specific domains, and only 4 of the 6 are drawn per exam sitting —
so every domain still needs to be solid even though any one exam won't test all 6
scenarios.

**Domain 1 — Agentic Architecture & Orchestration (27%, the largest domain), Task
Statements 1.1–1.7:** mostly well covered by Exercise 4 (agentic loop design,
coordinator-subagent hub-and-spoke pattern, explicit context passing, multi-concern
decomposition, error/handoff patterns) and Exercise 1 (loop control flow on
`stop_reason`, parallel `tool_use` handling). Two specific task statements are real
gaps:
- **1.5 — Agent SDK hooks (`PostToolUse`) for tool call interception/data
  normalization:** not used anywhere. Exercise 1's refund-threshold guardrail
  intercepts the tool call *inside hand-rolled application code*
  (`runAgentLoop.js`), which is the right idea but is not the Agent SDK's actual
  `hooks` mechanism the exam guide names specifically (`PostToolUse`, blocking
  outgoing tool calls, normalizing heterogeneous data formats from different MCP
  tools). None of the four exercises use Agent SDK hooks at all.
- **1.7 — Session state management (`--resume <session-name>`, `fork_session`):**
  not touched by any exercise. No exercise resumed a named session or forked one to
  explore divergent approaches from a shared baseline.

**Domain 2 — Tool Design & MCP Integration (18%), Task Statements 2.1–2.5:** tool
description design (2.1) is solidly covered (Exercise 1's disambiguation-pair tools).
Tool distribution/`tool_choice` (2.3) and built-in tools Read/Write/Edit/Bash/Grep/Glob
(2.5) are reasonably covered (Exercise 4's least-privilege subagent scoping; Exercise 1's
`tool_choice: auto` with parallel calls enabled). Two clear gaps:
- **2.2 — Structured error responses for *MCP* tools specifically (the `isError`
  flag pattern):** Exercise 1 built a structured-error pattern (`ToolError` with
  `errorCategory`/`isRetryable`), but that's a custom JS tool system talking to the
  Messages API directly, not an actual MCP server returning `isError`. The concept is
  practiced, the specific MCP mechanism is not.
- **2.4 — Integrating MCP servers into Agent SDK workflows, and MCP *resources* for
  exposing content catalogs:** Exercise 2 configures MCP servers into *Claude Code*
  (project `.mcp.json` vs. personal `~/.claude.json`), which is real coverage of half
  of this task statement. But no exercise wires an MCP server in as a tool inside an
  *Agent SDK* multi-agent pipeline (Exercise 4's subagents use only SDK built-ins:
  `WebSearch`, `WebFetch`, `Read`, `Grep`, `Glob`) — and MCP *resources* (as distinct
  from MCP *tools*) were never touched at all.

**Domain 3 — Claude Code Configuration & Workflows (20%), Task Statements 3.1–3.6:**
CLAUDE.md hierarchy (3.1) and path-specific rules (3.3) are covered in depth
(Exercise 2, Steps 1–2), as is plan mode vs. direct execution (3.4, Step 5). Three
gaps:
- **3.2 — Custom slash commands specifically:** Exercise 2 built a project-scoped
  *skill* (`.claude/skills/code-review/SKILL.md`) but never a `.claude/commands/`
  slash command — a different, sibling mechanism the exam guide calls out
  separately (project-scoped in `.claude/commands/` vs. personal in
  `~/.claude/commands/`).
- **3.5 — Iterative refinement techniques** (concrete input/output examples,
  test-driven iteration, the "interview pattern" for surfacing design considerations
  before implementing): not deliberately exercised as its own step in any of the four
  READMEs, though bug-fix cycles happened informally throughout.
- **3.6 — Integrating Claude Code into CI/CD pipelines** (`-p`/`--print` flag,
  `--output-format json`, `--json-schema`, avoiding duplicate-comment reviews on
  re-runs): not covered by any exercise — the single biggest, cleanest gap across the
  whole guide, and it's also directly the subject of Scenario 5 (one of the 6 exam
  scenarios).

**Domain 4 — Prompt Engineering & Structured Output (20%), Task Statements 4.2–4.5:**
well covered by Exercise 3 end-to-end (JSON schema design with required/nullable/enum
patterns, forced `tool_choice`, validation-retry loops, few-shot examples, batch
processing with the Message Batches API). Two gaps:
- **4.1 — Designing prompts with explicit review criteria to reduce false
  positives** (severity classification with concrete code examples per level,
  temporarily disabling high-false-positive categories): only lightly touched by
  Exercise 2's read-only code-review skill, which wasn't built around explicit,
  tested review criteria or false-positive-rate management the way the exam guide
  describes.
- **4.6 — Multi-instance and multi-pass review architectures** (an independent
  second Claude instance reviewing code without the generator's own reasoning
  context; splitting large multi-file reviews into per-file passes plus a separate
  cross-file integration pass): not built anywhere. This is also the direct subject
  of exam sample Question 12 (14-file PR review), so it's worth deliberately
  practicing.

**Domain 5 — Context Management & Reliability (15%), Task Statements 5.1–5.6:**
escalation/ambiguity resolution (5.2, Exercise 1's guardrail + escalation tool) and
error propagation across multi-agent systems (5.3, Exercise 4 Step 4) are solidly
covered; human review workflows with confidence signals (5.5) and information
provenance in multi-source synthesis (5.6) are well covered by Exercise 3 Step 5 and
Exercise 4 Step 3 respectively (5.6's *conflicting-data* half was attempted in
Exercise 4 Step 5 but the simulation never actually triggered, so that specific
sub-case — arbitrating two genuinely conflicting real values — was never validated
end-to-end). One clear gap:
- **5.4 — Managing context in large codebase exploration** (scratchpad files for
  persisting findings across context boundaries, structured state exports for crash
  recovery, `/compact` during long exploration sessions): not exercised at all — none
  of the four exercises worked against a large/unfamiliar codebase or practiced
  context-budget techniques. This is also the direct subject of exam Scenario 4
  (Developer Productivity with Claude).
- **5.1** is only partially covered — Exercise 1 touches basic message-history
  management and Exercise 4 Step 3 touches structured content/metadata separation,
  but the specific risks the exam guide names (progressive-summarization risk,
  "lost in the middle," trimming verbose tool outputs to relevant fields before they
  accumulate) were never directly tested.

**Out-of-scope confirmation:** the guide explicitly excludes fine-tuning, Claude API
auth/billing/account management, deploying/hosting MCP servers, Constitutional
AI/RLHF internals, computer use, vision, streaming APIs, rate limiting/quotas,
OAuth/key rotation, cloud-provider-specific configuration, and prompt-caching
implementation details. None of the four exercises strayed into these areas, so
there's nothing to trim.

## Suggested Next Steps (in priority order — largest, cleanest gaps first)

1. **CI/CD integration (Domain 3, Task 3.6 — also Scenario 5):** a short exercise
   running Claude Code headlessly with `-p`, using `--output-format json` +
   `--json-schema` to post structured PR feedback, and re-running reviews against a
   codebase with prior findings already in context to avoid duplicate comments.
2. **Multi-instance/multi-pass review (Domain 4, Task 4.6 — also sample Question
   12):** have an independent second Claude instance (no shared reasoning context)
   review code a first instance generated; separately, practice splitting a large
   multi-file review into per-file passes plus a cross-file integration pass.
3. **Large-codebase context management (Domain 5, Task 5.4 — also Scenario 4):** a
   short exercise against a real, larger/unfamiliar codebase — using subagent
   delegation for exploration, scratchpad files to persist findings across context
   boundaries, and `/compact` when context fills.
4. **Agent SDK hooks (Domain 1, Task 1.5):** rebuild Exercise 1's refund guardrail
   (or an equivalent) using an actual `PostToolUse` hook rather than hand-rolled
   interception in `runAgentLoop.js`, to get hands-on with the SDK's own mechanism.
5. **MCP inside Agent SDK orchestration + MCP resources (Domain 2, Tasks 2.2/2.4):**
   extend Exercise 4 (or a new short exercise) so at least one subagent's tool is
   backed by a real MCP server returning the `isError` flag, and expose an MCP
   *resource* (a content catalog) alongside it.
6. **Custom slash commands + session management (Domain 3 Task 3.2, Domain 1 Task
   1.7):** smaller, quicker gaps — add a `.claude/commands/` slash command to the
   Exercise 2 repo, and separately practice `--resume <name>` and `fork_session` in
   any Agent SDK script.
7. **Explicit review-criteria design (Domain 4, Task 4.1) and progressive-
   summarization/lost-in-the-middle handling (Domain 5, Task 5.1):** lower priority —
   both were partially touched already, so a review pass of the exam guide's own
   language on these task statements is likely enough without a full new exercise.
