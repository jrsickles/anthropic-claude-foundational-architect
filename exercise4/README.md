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

*(Step log continues below as further steps are completed)*
