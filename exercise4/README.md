# Exercise 4: Design and Debug a Multi-Agent Research Pipeline

**Objective:** Practice orchestrating subagents, managing context passing, implementing error propagation, and handling synthesis with provenance tracking.

This README is a running log of the exercise: each step's goal, the decisions made, and the results. It's being built incrementally as the exercise progresses, so it can double as documentation for the git repo.

## Context

This exercise is part of studying for the Claude Architect Exam, using API calls to Claude Console (the Anthropic API) to get hands-on practice with orchestration concepts covered on the exam:

- Subagent orchestration
- Context passing between agents
- Error propagation across a pipeline
- Synthesis of multiple agent outputs with provenance tracking (i.e., knowing which output came from which source/agent)

## Steps

### 1. Coordinator agent with two delegated subagents

**Goal:** Build a coordinator agent that delegates to at least two subagents (web search and document analysis), with the coordinator's `allowedTools` including `"Task"`, and with each subagent receiving its research findings directly in its prompt rather than relying on automatic context inheritance.

**Decisions:**

- **Language/SDK:** Python with the official Claude Agent SDK, rather than PHP. The exercise's own vocabulary (`allowedTools`, `Task`, subagent definitions) is specific to that SDK, which only ships for Python and TypeScript - no official PHP package exists. Python was chosen over TypeScript as the more familiar option.
- **Coordinator scoping:** `allowed_tools=["Task"]` so the coordinator can only delegate, never do the research or file-reading work itself.
- **Subagent scoping:** two subagents, each restricted to only the tools its job needs (least-privilege) - `web-researcher` (`WebSearch`, `WebFetch`) and `document-analyzer` (`Read`, `Grep`, `Glob`).
- **Explicit context passing:** the coordinator's system prompt directly instructs it to copy the web-researcher's findings, as plain text, into the prompt it sends to the document-analyzer - because subagents spawned via `Task` do not automatically inherit the coordinator's conversation history. Each `Task` call starts a fresh context containing only what's in that call's `prompt` argument.
- **Secrets handling:** `ANTHROPIC_API_KEY` loaded from a local `.env` file via `python-dotenv`, with `.env` gitignored and a `.env.example` placeholder committed instead.
- **Model:** switched from the CLI's default (Opus) to `claude-sonnet-5` on the coordinator, after an early run showed Opus's reasoning/synthesis turns dominating cost (~$2.03 of a $2.69 run). A later run with Sonnet dropped the equivalent cost to ~$0.57 of a $0.90 run - roughly the improvement expected given Sonnet's lower per-token pricing and more bounded output length. Subagents inherit this model by default since no per-subagent `model` was set on their `AgentDefinition`.
- **Output handling:** run output is written to a timestamped file per run (`output/run-<timestamp>.txt`) instead of printed to the console, so long transcripts don't clutter the terminal and different runs can be compared side by side. `output/` is tracked via `.gitkeep`; the run files themselves are gitignored.

**Debugging along the way:**

- First run: every tool call (`WebSearch`, `WebFetch`, even `Bash`) was denied with `permission_denied`. Root cause: `allowed_tools` in the Agent SDK is the *auto-approve list for the interactive permission prompt*, not a hard restriction on which tools exist - it doesn't scope tool availability the way each subagent's own `tools` list does. Since the script runs non-interactively, there was no terminal to approve the prompt, so every non-auto-approved call was denied by default. Fixed by adding `permission_mode="bypassPermissions"` to `ClaudeAgentOptions`, which is safe here because least-privilege scoping is already enforced per-subagent via their individual `tools` lists.
- Same run: the document-analyzer correctly refused to run against a nonexistent `./docs` directory rather than fabricating results - a good sign of the pipeline failing safely instead of hallucinating.
- A later test run (topic: swim training, cross-checked against a `./docs` file that was actually leftover building-code placeholder content) again correctly refused to invent a connection between the two, and said so explicitly rather than forcing a fabricated cross-check. Confirms the document-analyzer's instructions to only report genuine support/contradiction/silence are holding up even under mismatched inputs.

**Result:** Working coordinator (`coordinator.py`) that delegates to `web-researcher` and `document-analyzer` via `Task`, with findings passed explicitly through subagent prompts (verified in run transcripts - the document-analyzer references findings it could only have gotten from the prompt text, never from shared context). Supporting files: `.env.example`, `.gitignore`, `docs/building_codes_notes.md` (sample local doc for cross-checking), `output/` (per-run transcripts, gitignored).

---

### 2. Parallel subagent execution vs. sequential, with latency measurement

**Goal:** Have the coordinator emit multiple `Task` tool calls in a single response to run subagents in parallel, and measure the latency improvement over sequential execution.

**Design problem surfaced before writing any code:** Step 1's `document-analyzer` has a genuine data dependency on `web-researcher` (it needs findings to cross-check against), so those two can never be fairly parallelized - forcing them to run "together" would just mean document-analyzer runs with nothing to check yet. Considered two fixes (restructure the whole pipeline around independent stages, or bolt on a separate standalone parallel-only demo) before landing on a third option: add a new subagent whose work is independent of both existing ones, so the pipeline's real dependency stays intact while still creating a genuine opportunity for parallel dispatch.

**Decisions:**

- **New subagent - `recency-checker`:** scoped identically to `web-researcher` (`WebSearch`, `WebFetch`), but instructed to focus only on developments from the last 30-60 days rather than general background. Independent of `web-researcher` - no shared state needed - so the coordinator can legitimately dispatch both without either waiting on the other. `document-analyzer` remains sequential after both, now fed combined findings from `web-researcher` and `recency-checker` explicitly in its prompt (same explicit-context-passing principle as Step 1, extended to two upstream sources).
- **`--sequential` flag:** same task, same three subagents - only the coordinator's system-prompt instructions for *how* to call `web-researcher`/`recency-checker` change (fire together vs. one-at-a-time-and-wait). Isolates the call-pattern as the only variable between two otherwise-identical runs, which is what makes the timing comparison meaningful rather than confounded by task/subagent differences.
- **`--model` flag:** added after deciding to run the parallel-vs-sequential comparison on `claude-haiku-4-5` instead of the default `claude-sonnet-5`, since the goal was confirming the tool-call plumbing works, not research quality. Kept as a flag (default still Sonnet) rather than a permanent swap, since Haiku follows multi-step orchestration instructions less reliably.
- **Wall-clock timing:** each run records its own elapsed seconds and the model/mode used at the top and bottom of its output file, and output filenames are tagged `-parallel`/`-sequential` so runs can be diffed directly.

**Result - measured comparison (topic: pasture maintenance, both runs on `claude-haiku-4-5`):**

| | Parallel | Sequential |
|---|---|---|
| Wall-clock duration | 106.48s | 174.96s |
| Total cost | $0.347 | $0.524 |
| Web searches issued | 9 | 17 |

Parallel dispatch was **~39% faster** and, in this run, **~34% cheaper**. The cost difference is a secondary finding, not the main claim - the sequential run's subagents did measurably more searching and consumed more tokens overall, so part of that gap reflects the subagents choosing to do more work sequentially (plausibly encouraged by the sequential instruction phrasing, and/or Haiku's less consistent instruction-following), not a mechanical property of parallel-vs-sequential scheduling by itself.

**A precision worth recording for the exam:** checking the raw transcript, the coordinator did not literally place two `Task`/`Agent` tool_use blocks inside one `AssistantMessage` - each subagent delegation was still its own assistant turn. What actually produced the speedup was that the SDK's task scheduler started `recency-checker` (its `task_started` event fired) while `web-researcher` was still running, rather than the coordinator blocking on `web-researcher`'s full completion before issuing the next call. So "parallel" here is real concurrent execution at the task-scheduling level, confirmed by the latency delta - but it's worth not overstating it as literally-one-response, two-tool-uses, since that's not what the transcript shows.

**Research integrity check (secondary, since accuracy wasn't the goal of this step):** both runs correctly identified that `./docs` still only contains the Step 1 building-code placeholder file, has no pasture-related content, and both refused to fabricate a connection - consistent with Step 1's document-analyzer behavior holding up under a third, unrelated test topic.

**Result:** `coordinator.py` now orchestrates three subagents (`web-researcher`, `recency-checker`, `document-analyzer`), supports `--sequential` and `--model <name>` flags, and records per-run wall-clock timing - enabling the side-by-side comparison above.

---

### 3. Structured findings (content vs. metadata) with verified source attribution

**Goal:** Design structured output for subagents that separates content from metadata - each finding should include a claim, evidence excerpt, source URL/document name, and publication date - and verify that the synthesis subagent preserves source attribution when combining findings.

**Setup problem noticed before writing code:** every run so far had `document-analyzer` returning zero real findings, because `./docs` only contained the Step 1 building-codes placeholder and every test topic since (swim training, pasture maintenance) was unrelated to it. That was fine when testing plumbing, but Step 3 needed at least one subagent to produce genuine, checkable findings - otherwise there'd be nothing to verify attribution on. Added `docs/pasture_maintenance_notes.md`, a real dated (2025-03-10) local reference doc on the same topic used in Step 2's testing, so `document-analyzer` would have actual claims to extract.

**Decisions:**

- **Finding schema:** every subagent (`web-researcher`, `recency-checker`, `document-analyzer`) must return a fenced ```json array of objects with exactly four keys - `claim`, `evidence_excerpt`, `source` (URL for web findings, local file path for document findings), `publication_date` (ISO date or `null` - explicitly instructed not to guess a date if unknown). This is the content/metadata separation the step asked for: `claim`/`evidence_excerpt` are the content, `source`/`publication_date` are the metadata that make the content traceable and datable.
- **Synthesis must re-emit the same schema, not paraphrase it away:** the coordinator's system prompt requires its final synthesis to include its own ```json block - an array of every finding from all three subagents, merged, with the original four fields kept byte-for-byte and one field added, `source_agent`, naming which subagent produced it. Keeping the original fields (rather than letting the coordinator summarize them into prose) is what makes provenance survive the merge instead of dissolving into an unsourced summary.
- **Verification is automated, not eyeballed:** added `extract_findings()` (parses every ```json block out of subagent vs. coordinator text) and `verify_attribution()` (checks that each subagent finding's `(source, publication_date)` pair appears unchanged in the synthesis output). The report - counts and any dropped/altered findings - is appended to the run file and printed to console after every run. This directly answers the step's "verify" requirement with a repeatable check instead of a one-time manual read.
- Text extraction had to bypass the existing `repr(message)` logging: `repr()` escapes newlines as literal `\n`, which breaks multi-line JSON regex matching. Added a separate `_extract_text()` pass that pulls real text (with real newlines) out of each message's `content` during the run, split into `coordinator_texts` vs. `subagent_texts` using `parent_tool_use_id` (`None` = coordinator's own turn; set = originated inside a subagent).

**Result - measured run (topic: pasture maintenance, parallel mode, `claude-sonnet-5`):**

```
Subagent findings extracted: 33
Synthesis findings extracted: 33
Findings with (source, publication_date) preserved in synthesis: 33/33
No findings were dropped or altered.
```

A clean 33/33 pass - every finding's source and publication date survived the coordinator's merge unchanged. Cost/time for this run: $1.30, 302.92s - notably more than Step 2's Haiku runs, consistent with Sonnet's higher per-token cost and three subagents now each producing structured JSON output rather than free-form prose.

**Caveat flagged, not yet resolved:** a 33/33 match is a good sign but not fully conclusive on its own - it doesn't rule out, for example, the model quietly reusing today's date across many findings instead of genuinely using `null` where a source had no date. The current check verifies the (source, date) pair round-trips unchanged; it does not independently verify that the subagents' *original* dates were themselves faithful to what the source material actually said. Spot-checking a sample of findings by hand is the natural next validation step if this pipeline were to go further.

**Result:** `coordinator.py` now enforces a structured, four-field finding schema across all three subagents and the coordinator's own synthesis, and automatically verifies attribution survives the merge on every run. Supporting file: `docs/pasture_maintenance_notes.md` (real dated local content for `document-analyzer` to extract genuine findings from).

---

### 4. Error propagation: simulated subagent timeout, partial results, coverage-gap annotation

**Goal:** Simulate a subagent timeout and verify the coordinator receives structured error context (failure type, attempted query, partial results). Test that the coordinator can proceed with partial results and annotate the final output with coverage gaps.

**Design problem worked through before writing code:** a *real* timeout can't be injected from outside the SDK - the coordinator decides when to call a subagent, and the SDK runs each `Task` call as an opaque unit with no exposed per-call timeout hook. So this simulates the failure instead of trying to force a genuine one: `--simulate-timeout <subagent-name>` rewrites that subagent's prompt to deliberately make exactly one tool call, then stop and return a structured error object instead of its normal findings - shaped like a real partial-completion timeout (some evidence gathered, then cut off) rather than either a full success or a silent blank failure.

**Decisions:**

- **Error schema:** `{failure_type, attempted_query, partial_results, error_message}` - `partial_results` uses the same claim/evidence_excerpt/source/publication_date shape as Step 3's findings, so anything gathered before the simulated cutoff is still a real, checkable finding, not just a string saying "it failed."
- **Coordinator instructions extended, not replaced:** the system prompt now tells the coordinator that a subagent returning a `failure_type` object is not fatal - continue with whichever subagents succeeded, fold any `partial_results` into the merged findings (still tagged with the correct `source_agent`), and say so explicitly in prose.
- **Synthesis JSON shape changed from Step 3:** instead of a bare findings array, the final synthesis is now a JSON *object* with two keys - `findings` (same as before) and `coverage_gaps` (an array of `{subagent, failure_type, attempted_query, error_message}` objects, one per failure). This is what makes the gap machine-checkable rather than just "mentioned somewhere in the prose."
- **Flag chosen to target any subagent** (`web-researcher`, `recency-checker`, or `document-analyzer`), not hardcoded to one - specifically so `web-researcher` could be tested, since it's the one whose failure cascades (`document-analyzer` depends on its output), unlike `recency-checker`'s failure which is fully independent.
- **Verification extended again, same automated approach as Step 3:** `verify_error_propagation()` checks whether the targeted subagent actually returned a structured error object, whether the coordinator's `coverage_gaps` array contains a matching entry, and whether the failed subagent's `partial_results` sources made it into the final findings.

**Debugging along the way - the simulation itself didn't fire on the first attempt:** the first test run (`--simulate-timeout web-researcher`, default `claude-haiku-4-5`) came back with the verification report showing "Structured error object received from the subagent: NO." Checking the transcript confirmed why: `web-researcher` made 8 full turns and returned 41 real findings - it simply ignored the simulated-failure instructions appended to its prompt and did the actual task instead. This is the same instruction-following gap flagged in Step 2/3: Haiku deprioritized a meta-instruction ("pretend to fail") in favor of the object-level task ("research this topic"), where a stronger model held to it. Re-running the identical command with `--model claude-sonnet-5` fixed it cleanly.

**Result - verified run (topic: pasture maintenance, parallel mode, `claude-sonnet-5`, `--simulate-timeout web-researcher`):**

```
Simulated failure target: web-researcher
Structured error object received from the subagent: YES (1 error object(s) found in subagent output)
  failure_type='timeout' attempted_query='pasture maintenance rotational grazing soil health best practices'
  partial_results=3 item(s) error_message='Simulated timeout in web-researcher after 1 tool call.'
Coordinator's synthesis annotated this as a coverage gap: YES -> {'subagent': 'web-researcher', 'failure_type': 'timeout', ...}
Partial results from the failed subagent: 2 source(s); carried into final findings: 2/2
```

`web-researcher` made only 3 turns (vs. 10 each for the other two subagents) - consistent with "one tool call, then stop." All four requirements from the step were confirmed in one run: the coordinator received structured error context (failure type, attempted query, partial results all present), it proceeded rather than halting - `document-analyzer` still completed 10 turns of real cross-check work against a partially-failed upstream input, which was the more interesting case precisely because of the dependency - partial results were preserved rather than discarded, and the coverage gap was annotated in a form that matched the original error object field-for-field. Step 3's attribution check also held up under failure conditions: 26/26 subagent findings preserved into synthesis.

**Result:** `coordinator.py` supports `--simulate-timeout <subagent-name>` for any of the three subagents, degrades gracefully on a simulated failure (including the cascading case where the failed subagent is a real dependency of another), and automatically verifies structured error propagation and coverage-gap annotation on every run via `verify_error_propagation()`.

---

*(Step log continues below as further steps are completed)*
