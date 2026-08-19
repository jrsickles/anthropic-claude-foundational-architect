"""
Exercise 4 - Coordinator agent orchestrating three subagents.

Step 1 demonstrated:
  - A coordinator whose allowed_tools includes "Task" (required to delegate
    work to subagents at all).
  - Subagents each scoped to only the tools their job needs
    (least-privilege tool access).
  - Explicit context passing: the coordinator is instructed to paste prior
    subagent findings directly into the prompt it sends to the next
    subagent, because subagents spawned via Task do NOT automatically
    inherit the coordinator's conversation history. Each Task call starts a
    fresh context containing only the prompt text given to it at call time.

Step 2 adds:
  - A third subagent, recency-checker, whose work is independent of both
    web-researcher and document-analyzer (different query angle, no shared
    state needed). Because web-researcher and recency-checker don't depend
    on each other's output, the coordinator CAN emit both Task calls in a
    single response and let them run in parallel - unlike document-analyzer,
    which genuinely needs web-researcher's findings first and so must stay
    sequential after it.
  - A --sequential flag that swaps the coordinator's system prompt between
    "call web-researcher and recency-checker together, in parallel" and
    "call them one at a time, waiting for each to finish" - same task,
    same subagents, only the call pattern differs - so the two run files
    can be compared for a real latency measurement.
  - Wall-clock timing around the whole run, so each output file records how
    long it took.

Step 3 adds:
  - A structured finding schema that separates content from metadata: every
    subagent must return findings as a fenced ```json array of objects with
    exactly these keys - claim, evidence_excerpt, source, publication_date
    (null if unknown). This applies to all three subagents, including
    document-analyzer, whose `source` is the local file path/name it read
    (not a URL).
  - The coordinator's own final synthesis must ALSO be returned as a
    ```json array in the same shape, plus a `source_agent` key identifying
    which subagent each finding came from - so provenance survives the
    merge, not just the raw subagent outputs.
  - Automated verification (not just eyeballing): after the run, the script
    extracts every JSON finding block emitted by a subagent and every JSON
    finding block emitted by the coordinator's final synthesis, and checks
    that each subagent finding's (source, publication_date) pair survives
    unchanged into the synthesis. A verification report - counts, and any
    findings whose source/date were dropped or altered - is appended to the
    run's output file.

Requirements:
  pip install claude-agent-sdk python-dotenv
  A .env file in this directory containing:
    ANTHROPIC_API_KEY=sk-ant-...
  (see .env.example)

Usage:
  python coordinator.py "Research <topic> and cross-check it against the local docs/ folder"
  python coordinator.py "Research <topic> and cross-check it against the local docs/ folder" --sequential
  python coordinator.py "..." --model claude-sonnet-5   # DEFAULT_MODEL below is currently
                                                         # set to the cheapest tier for
                                                         # plumbing tests - override with
                                                         # --model when research quality
                                                         # (and reliably-formatted JSON
                                                         # findings) matters
"""

DEFAULT_MODEL = "claude-haiku-4-5"

import json
import os
import re
import sys
import time
import anyio
from pathlib import Path
from dotenv import load_dotenv
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition

OUTPUT_DIR = Path(__file__).parent / "output"

# Load ANTHROPIC_API_KEY (and any other vars) from a .env file in this
# directory into the process environment. The Agent SDK itself only reads
# credentials from os.environ - it has no built-in .env support - so this
# load_dotenv() call is what bridges the .env file into that environment
# before ClaudeAgentOptions/query() are used.
load_dotenv()

if not os.environ.get("ANTHROPIC_API_KEY"):
    print(
        "ANTHROPIC_API_KEY is not set. Create a .env file in this directory "
        "(see .env.example) or export it in your shell."
    )
    raise SystemExit(1)


# --- Step 3: structured finding schema ---------------------------------
#
# Every finding, from every subagent, must separate CONTENT (the claim and
# the evidence backing it) from METADATA (where it came from and when it
# was published/reviewed). This is what lets the coordinator's synthesis be
# checked programmatically for attribution loss, instead of just trusting
# that a paragraph "mentions its sources somewhere."

FINDING_SCHEMA_INSTRUCTIONS = (
    "Return your findings as a fenced JSON code block (```json ... ```) "
    "containing an array of objects. Each object must have EXACTLY these "
    "four keys:\n"
    '  - "claim": the finding itself, one sentence.\n'
    '  - "evidence_excerpt": a short direct quote or close paraphrase of '
    "the specific text that supports the claim.\n"
    '  - "source": the URL (for web findings) or local file path (for '
    "document findings) the claim came from.\n"
    '  - "publication_date": an ISO date (YYYY-MM-DD) if known, otherwise '
    "the JSON value null - do not guess a date.\n"
    "Include this JSON block even if you also write prose - the JSON block "
    "is what gets parsed downstream. If you have no findings, return an "
    "empty JSON array []."
)


PARALLEL_INSTRUCTIONS = (
    "1. In a SINGLE response, emit two Task tool calls at once: one to "
    "web-researcher (general/background research on the user's topic) and "
    "one to recency-checker (only the most recent developments, last "
    "30-60 days, on the same topic). Do not wait for one to finish before "
    "issuing the other - they are independent of each other and can run "
    "in parallel.\n"
)

SEQUENTIAL_INSTRUCTIONS = (
    "1. Delegate to the web-researcher subagent first. Wait for it to "
    "return before doing anything else.\n"
    "2. Only after web-researcher has returned, delegate to the "
    "recency-checker subagent (most recent developments, last 30-60 days, "
    "on the same topic). Wait for it to return as well.\n"
)


def build_options(sequential: bool, model: str) -> ClaudeAgentOptions:
    call_pattern = SEQUENTIAL_INSTRUCTIONS if sequential else PARALLEL_INSTRUCTIONS

    return ClaudeAgentOptions(
        # allowed_tools is the auto-approve list for the (session-wide)
        # interactive permission prompt - it does NOT scope which tools a
        # subagent can actually call. Per-subagent scoping is done below via
        # each AgentDefinition's own `tools` list. Since this script runs
        # non-interactively, there's no terminal to answer a permission
        # prompt, so we also set permission_mode="bypassPermissions" to skip
        # that gate entirely - safe here because least-privilege is already
        # enforced per subagent via their `tools` lists.
        allowed_tools=["Task"],
        permission_mode="bypassPermissions",
        agents={
            "web-researcher": AgentDefinition(
                description=(
                    "Searches the web for general/background information on a "
                    "topic and returns structured findings with sources/URLs."
                ),
                prompt=(
                    "You are a research assistant. Given a topic, search the web "
                    "for general/background information. "
                    + FINDING_SCHEMA_INSTRUCTIONS
                ),
                tools=["WebSearch", "WebFetch"],
            ),
            "recency-checker": AgentDefinition(
                description=(
                    "Searches the web specifically for the most recent "
                    "developments (last 30-60 days) on a topic. Independent of "
                    "web-researcher - does not need its output and can run "
                    "alongside it."
                ),
                prompt=(
                    "You are a recency-focused research assistant. Given a "
                    "topic, search the web for only the most recent "
                    "developments - roughly the last 30-60 days. Ignore "
                    "older/background material; that is handled by a separate "
                    "subagent. " + FINDING_SCHEMA_INSTRUCTIONS
                ),
                tools=["WebSearch", "WebFetch"],
            ),
            "document-analyzer": AgentDefinition(
                description=(
                    "Analyzes local documents against research findings that are "
                    "supplied directly in its prompt. Use this after "
                    "web-researcher and recency-checker have both returned."
                ),
                prompt=(
                    "You are a document analyst. You will be given prior research "
                    "findings directly in your prompt text - you have no access to "
                    "any earlier conversation, so treat the prompt as your only "
                    "source of that context. Read the specified local files and "
                    "assess how they relate to (support, contradict, or are silent "
                    "on) those findings. For each relevant thing you find in the "
                    'local files, produce a finding whose "source" is the local '
                    'file path and whose "publication_date" is that document\'s '
                    "own stated date if it has one (otherwise null - do not use "
                    "today's date as a substitute). " + FINDING_SCHEMA_INSTRUCTIONS
                ),
                tools=["Read", "Grep", "Glob"],
            ),
        },
        system_prompt=(
            "You are a research coordinator orchestrating three subagents via "
            "the Task tool. Follow this sequence:\n"
            + call_pattern
            + "2. Once web-researcher and recency-checker have both returned, read "
            "both sets of structured findings yourself.\n"
            "3. Delegate to the document-analyzer subagent. In the prompt you give "
            "it, explicitly include BOTH web-researcher's and recency-checker's "
            "findings (their full JSON, not a paraphrase) as plain text, plus the "
            "local path(s) to analyze. Do not assume document-analyzer can see "
            "prior subagent output on its own - subagents do not share context "
            "automatically, so you must copy the relevant findings into the "
            "prompt yourself.\n"
            "4. Once all three subagents have reported back, produce a final "
            "synthesis for the user. Your final synthesis MUST include a fenced "
            "```json code block containing an array of ALL findings from ALL "
            "three subagents, merged. Each object must keep the same four keys "
            "(claim, evidence_excerpt, source, publication_date) EXACTLY as the "
            "subagent reported them - do not paraphrase away, shorten, or drop "
            'the source or publication_date - and add a fifth key, '
            '"source_agent", set to whichever of web-researcher, '
            "recency-checker, or document-analyzer produced that finding. This "
            "is how provenance is preserved through the merge - every finding in "
            "your output must be traceable back to the subagent and source it "
            "came from. You may also write prose summarizing the findings, but "
            "the JSON block must be present and complete."
        ),
        model=model,
    )


def _extract_text(content) -> str:
    """Pull plain text out of an SDK message's `content`, which may be a
    string, or a list of blocks/dicts (TextBlock, ToolResultBlock, etc.)."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts = []
    for item in content:
        text = getattr(item, "text", None)
        if text is None and isinstance(item, dict):
            text = item.get("text")
        if text is None and isinstance(item, dict):
            # ToolResultBlock-style content can itself be a nested list of
            # {"type": "text", "text": ...} dicts.
            inner = item.get("content")
            if isinstance(inner, list):
                text = _extract_text(inner)
            elif isinstance(inner, str):
                text = inner
        if text:
            parts.append(text)
    return "\n".join(parts)


_JSON_BLOCK_RE = re.compile(r"```json\s*(\[.*?\])\s*```", re.DOTALL)


def extract_findings(text: str) -> list:
    """Pull every well-formed findings array out of one or more ```json
    fenced blocks in `text`. Malformed blocks are skipped, not fatal -
    a subagent producing bad JSON shouldn't crash the whole run."""
    findings = []
    for raw in _JSON_BLOCK_RE.findall(text):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            findings.extend(f for f in parsed if isinstance(f, dict))
    return findings


def verify_attribution(subagent_findings: list, synthesis_findings: list) -> str:
    """Check that every subagent finding's (source, publication_date) pair
    survives, unchanged, into at least one synthesis finding. Returns a
    human-readable report; does not raise - a failed check is a finding
    about the pipeline, not a crash."""
    lines = []
    lines.append(f"Subagent findings extracted: {len(subagent_findings)}")
    lines.append(f"Synthesis findings extracted: {len(synthesis_findings)}")

    synthesis_keys = {
        (f.get("source"), f.get("publication_date")) for f in synthesis_findings
    }

    preserved = 0
    dropped = []
    for f in subagent_findings:
        key = (f.get("source"), f.get("publication_date"))
        if key in synthesis_keys:
            preserved += 1
        else:
            dropped.append(f)

    total = len(subagent_findings)
    lines.append(
        f"Findings with (source, publication_date) preserved in synthesis: "
        f"{preserved}/{total}"
    )

    missing_source_agent = [f for f in synthesis_findings if not f.get("source_agent")]
    if missing_source_agent:
        lines.append(
            f"WARNING: {len(missing_source_agent)} synthesis finding(s) are "
            "missing a source_agent tag."
        )

    if dropped:
        lines.append("\nDropped or altered (present in subagent output, not found "
                      "unchanged in synthesis):")
        for f in dropped:
            lines.append(f"  - source={f.get('source')!r} "
                         f"publication_date={f.get('publication_date')!r} "
                         f"claim={f.get('claim')!r}")
    else:
        lines.append("\nNo findings were dropped or altered.")

    return "\n".join(lines)


async def main() -> None:
    raw_args = sys.argv[1:]
    sequential = "--sequential" in raw_args

    model = DEFAULT_MODEL
    if "--model" in raw_args:
        idx = raw_args.index("--model")
        try:
            model = raw_args[idx + 1]
        except IndexError:
            print("--model requires a value, e.g. --model claude-sonnet-5")
            raise SystemExit(1)

    # Positional args = anything left over that isn't a flag or a flag's value.
    skip_next = False
    args = []
    for a in raw_args:
        if skip_next:
            skip_next = False
            continue
        if a == "--model":
            skip_next = True
            continue
        if a.startswith("--"):
            continue
        args.append(a)

    if not args:
        print(
            'Usage: python coordinator.py "<research task for the coordinator>" '
            "[--sequential] [--model <model-name>]"
        )
        raise SystemExit(1)

    task_prompt = args[0]
    options = build_options(sequential=sequential, model=model)

    OUTPUT_DIR.mkdir(exist_ok=True)
    # One file per run, timestamped so repeated runs don't overwrite each
    # other - useful for comparing runs (e.g. before/after a prompt change,
    # parallel vs. sequential, or Opus vs. Sonnet) side by side later.
    mode_tag = "sequential" if sequential else "parallel"
    run_file = OUTPUT_DIR / f"run-{time.strftime('%Y%m%d-%H%M%S')}-{mode_tag}.txt"

    print(f"Running ({mode_tag})... output is being written to {run_file}")

    # Text collected per role, with real newlines (not the escaped \n you'd
    # get from repr()), so the JSON-block regex above can actually match
    # multi-line findings arrays after the run completes.
    subagent_texts = []
    coordinator_texts = []

    start = time.monotonic()
    with run_file.open("w", encoding="utf-8") as f:
        f.write(f"MODE: {mode_tag}\n")
        f.write(f"MODEL: {model}\n")
        f.write(f"PROMPT: {task_prompt}\n")
        f.write("=" * 80 + "\n\n")

        async for message in query(prompt=task_prompt, options=options):
            f.write(repr(message) + "\n\n")

            content = getattr(message, "content", None)
            if content is None:
                continue
            text = _extract_text(content)
            if not text:
                continue

            # parent_tool_use_id is None for the coordinator's own turns,
            # and set to the Task's tool_use_id for anything originating
            # inside a subagent (its own turns, and the UserMessage
            # carrying its final tool result back to the coordinator).
            if getattr(message, "parent_tool_use_id", None) is None:
                coordinator_texts.append(text)
            else:
                subagent_texts.append(text)

        elapsed = time.monotonic() - start
        f.write("=" * 80 + "\n")
        f.write(f"WALL-CLOCK DURATION: {elapsed:.2f}s ({mode_tag})\n")

        # --- Step 3: automated source-attribution verification ---------
        subagent_findings = []
        for t in subagent_texts:
            subagent_findings.extend(extract_findings(t))

        synthesis_findings = []
        for t in coordinator_texts:
            synthesis_findings.extend(extract_findings(t))

        report = verify_attribution(subagent_findings, synthesis_findings)
        f.write("\n" + "=" * 80 + "\n")
        f.write("VERIFICATION: source attribution preserved through synthesis\n")
        f.write("=" * 80 + "\n")
        f.write(report + "\n")

    print(f"Done in {elapsed:.2f}s ({mode_tag}). Output written to {run_file}")
    print("\n--- Attribution verification ---")
    print(report)


if __name__ == "__main__":
    anyio.run(main)
