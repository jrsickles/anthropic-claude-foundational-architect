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

*(Step log continues below as further steps are completed)*
