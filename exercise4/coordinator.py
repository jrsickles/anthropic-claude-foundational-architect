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

Step 4 adds:
  - Error propagation. There's no way to inject a *real* network-level
    timeout into an internal Task call from outside the SDK's black box, so
    this simulates one instead: --simulate-timeout <subagent-name> rewrites
    that subagent's prompt so it deliberately makes exactly one tool call,
    then stops and returns a structured error object -
    {failure_type, attempted_query, partial_results, error_message} -
    instead of its normal findings array. partial_results carries whatever
    it gathered from that single call before "timing out", so the failure
    looks like a real partial-completion timeout rather than a total wipe.
  - The coordinator's system prompt now explicitly covers this case: a
    subagent error object is not fatal. The coordinator must continue with
    whichever subagents succeeded, fold any partial_results into the merged
    findings (tagged with source_agent as usual), and annotate its final
    synthesis with a `coverage_gaps` array documenting which subagent
    failed, what it was trying to do, and why. To keep this parseable, the
    final synthesis's JSON block changed shape from Step 3: it's now a
    JSON OBJECT with keys "findings" and "coverage_gaps", rather than a
    bare array.
  - Automated verification extends to check: when --simulate-timeout was
    used, does the synthesis's coverage_gaps array actually contain an
    entry for that subagent, and did its partial_results (if any) make it
    into the merged findings.

Step 5 adds:
  - Conflicting source data. Same problem as Step 4's timeout: waiting for
    real web search to coincidentally surface two credible sources that
    disagree on a statistic isn't a reliable, repeatable test. Simulated
    instead: --simulate-conflict forces BOTH web-researcher and
    recency-checker to skip real research and each report one fixed,
    fabricated finding on the same underlying claim, but with different
    numeric values and different (also fabricated, clearly-marked-as-test)
    sources - CONFLICT_SOURCE_A / CONFLICT_SOURCE_B below.
  - The coordinator's system prompt now covers this case too: if two or
    more findings address the same underlying question but disagree, do
    NOT arbitrarily keep only one - keep both in the merged findings array
    (each still tagged with its own source_agent, per Step 3), AND add an
    entry to a new "contested_claims" array in the synthesis JSON
    describing the conflict and listing every conflicting value with its
    source. The synthesis JSON is now a JSON OBJECT with three keys:
    "findings", "coverage_gaps", "contested_claims".
  - Automated verification checks that both CONFLICT_SOURCE_A's and
    CONFLICT_SOURCE_B's findings survive into the synthesis's findings
    array (neither arbitrarily dropped) AND that contested_claims contains
    an entry referencing both sources (the conflict was actually flagged,
    not just silently listed twice).

Requirements:
  pip install claude-agent-sdk python-dotenv
  A .env file in this directory containing:
    ANTHROPIC_API_KEY=sk-ant-...
  (see .env.example)

Usage:
  python coordinator.py "Research <topic> and cross-check it against the local docs/ folder"
  python coordinator.py "..." --sequential
  python coordinator.py "..." --model claude-sonnet-5   # DEFAULT_MODEL below is currently
                                                         # set to the cheapest tier for
                                                         # plumbing tests - override with
                                                         # --model when research quality
                                                         # (and reliably-formatted JSON
                                                         # findings) matters
  python coordinator.py "..." --simulate-timeout recency-checker
      # forces the named subagent (web-researcher | recency-checker |
      # document-analyzer) to fail with a simulated timeout, to test error
      # propagation and coverage-gap annotation
  python coordinator.py "..." --simulate-conflict
      # forces web-researcher and recency-checker to each report a fixed,
      # deliberately conflicting finding (different stated values, from
      # different fabricated sources), to test that synthesis preserves
      # both values with attribution and flags the conflict rather than
      # silently picking one. Not combinable with --simulate-timeout.
"""

from __future__ import annotations

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
VALID_SUBAGENTS = ("web-researcher", "recency-checker", "document-analyzer")

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


# --- Step 4: simulated-failure schema -----------------------------------
#
# Appended (instead of the normal task) to whichever subagent is named by
# --simulate-timeout. Deliberately shaped like a real partial-completion
# timeout: do a little real work, then stop and report it as a structured
# failure rather than silently returning nothing or crashing the process.

def simulated_timeout_instructions(subagent_name: str) -> str:
    return (
        "\n\nSIMULATED FAILURE MODE (for testing this pipeline's error "
        "handling only - not a real system failure): Do NOT attempt to "
        "complete the task above in full. Instead: (1) make exactly ONE "
        "tool call to gather a small amount of information, whatever that "
        "call returns, (2) then STOP - do not make any further tool calls "
        "- and respond with ONLY a fenced ```json object (a single JSON "
        "OBJECT, not an array) with exactly these four keys:\n"
        '  - "failure_type": the string "timeout".\n'
        '  - "attempted_query": the topic/task you were given.\n'
        '  - "partial_results": an array of whatever findings (using the '
        "normal claim/evidence_excerpt/source/publication_date shape) you "
        "were able to produce from that one tool call - this can be an "
        "empty array [] if that call returned nothing useful.\n"
        '  - "error_message": a short human-readable string, e.g. '
        f'"Simulated timeout in {subagent_name} after 1 tool call."\n'
        "Do NOT return your normal findings array for this task - return "
        "this single error object instead."
    )


# --- Step 5: simulated-conflict schema ----------------------------------
#
# Fixed, fabricated conflicting finding pair. Both sources are clearly
# marked as test fixtures (TESTCONFLICT in the URL) so they can never be
# confused with a real citation, and so verify_contested_claims() below can
# match on them exactly rather than guessing which findings conflict.

CONFLICT_SOURCE_A = "https://extension.example.edu/pasture-guidelines-TESTCONFLICT"
CONFLICT_SOURCE_B = "https://livestockresearch.example.org/grazing-intervals-TESTCONFLICT"


def simulated_conflict_instructions_a() -> str:
    return (
        "\n\nSIMULATED CONFLICT MODE (for testing this pipeline's handling "
        "of contradictory sources only - not real research): Skip your "
        "normal research task entirely. Instead, return ONLY this exact "
        "fenced ```json array (do not alter the values):\n"
        "```json\n"
        "[{\n"
        '  "claim": "The recommended pasture rest period between grazing '
        'rotations is 14 days.",\n'
        '  "evidence_excerpt": "Extension guidance recommends a minimum '
        '14-day rest period to allow adequate forage regrowth.",\n'
        f'  "source": "{CONFLICT_SOURCE_A}",\n'
        '  "publication_date": "2024-06-01"\n'
        "}]\n"
        "```"
    )


def simulated_conflict_instructions_b() -> str:
    return (
        "\n\nSIMULATED CONFLICT MODE (for testing this pipeline's handling "
        "of contradictory sources only - not real research): Skip your "
        "normal research task entirely. Instead, return ONLY this exact "
        "fenced ```json array (do not alter the values):\n"
        "```json\n"
        "[{\n"
        '  "claim": "The recommended pasture rest period between grazing '
        'rotations is 21 days.",\n'
        '  "evidence_excerpt": "Recent grazing-interval research found '
        '21-day rest periods produced measurably better forage recovery '
        'than shorter cycles.",\n'
        f'  "source": "{CONFLICT_SOURCE_B}",\n'
        '  "publication_date": "2025-01-15"\n'
        "}]\n"
        "```"
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


ERROR_PROPAGATION_INSTRUCTIONS = (
    "\n\nERROR HANDLING: any subagent may, instead of its normal findings "
    "array, return a JSON OBJECT with a \"failure_type\" key (e.g. "
    '{"failure_type": "timeout", "attempted_query": ..., '
    '"partial_results": [...], "error_message": ...}). This means that '
    "subagent failed to complete its task. This is NOT fatal to the "
    "overall pipeline - do not stop, and do not pretend the failure didn't "
    "happen. Instead:\n"
    "  a. Continue the pipeline using whichever subagents succeeded.\n"
    "  b. If the failed subagent's partial_results array is non-empty, "
    "treat those as real findings and include them in your final merged "
    "findings (tagged with the correct source_agent) - a partial timeout "
    "still produced some real evidence, and it should not be discarded.\n"
    "  c. In your final synthesis JSON object (shape given below), set "
    '"coverage_gaps" to an array of objects - one per failed subagent - '
    'each with keys "subagent", "failure_type", "attempted_query", and '
    '"error_message", copied from that subagent\'s error object. If '
    "nothing failed, coverage_gaps should be an empty array [].\n"
    "  d. Also say so in your prose summary - explicitly tell the user "
    "which subagent failed, what it was trying to do, and what that means "
    "is missing or less complete in your answer as a result."
)


CONTESTED_CLAIMS_INSTRUCTIONS = (
    "\n\nCONFLICTING SOURCES: two or more subagents may report findings "
    "that address the same underlying question but disagree - e.g. "
    "different subagents citing different numbers for the same statistic. "
    "When this happens, you must NOT arbitrarily keep only one value and "
    "discard the other, and you must NOT silently present both as if they "
    "were consistent. Instead:\n"
    "  a. Keep BOTH (or all) conflicting findings in your merged findings "
    "array, each still tagged with its own correct source_agent and "
    "source, exactly as Step 3's provenance rules require.\n"
    "  b. In your final synthesis JSON object, set \"contested_claims\" to "
    "an array of objects, one per conflict, each with keys \"topic\" (a "
    "short description of what's being disputed), and \"conflicting_values"
    "\" (an array of objects, one per disagreeing source, each with keys "
    "\"value\", \"source\", \"source_agent\", \"publication_date\" - "
    "pulled directly from the corresponding findings, not reworded). If "
    "there are no conflicts, contested_claims should be an empty array [].\n"
    "  c. In your prose summary, explicitly distinguish well-established "
    "findings (reported consistently, or by only one source with no "
    "contradiction) from contested ones - do not present a contested claim "
    "as settled fact."
)


SYNTHESIS_JSON_SHAPE_INSTRUCTIONS = (
    "\n\nFINAL SYNTHESIS JSON SHAPE: your final synthesis must include a "
    "fenced ```json code block containing a single JSON OBJECT with "
    'exactly three keys: "findings" (array - every finding from every '
    "subagent, merged, each keeping its original claim/evidence_excerpt/"
    "source/publication_date EXACTLY as reported plus a source_agent key "
    'naming which subagent produced it), "coverage_gaps" (array - see '
    'ERROR HANDLING), and "contested_claims" (array - see CONFLICTING '
    "SOURCES). Do not paraphrase, shorten, or drop a finding's source or "
    "publication_date when merging - that is how provenance survives the "
    "merge. You may also write prose, but the JSON block must be present "
    "and complete."
)


def build_options(
    sequential: bool,
    model: str,
    simulate_timeout: str | None,
    simulate_conflict: bool,
) -> ClaudeAgentOptions:
    call_pattern = SEQUENTIAL_INSTRUCTIONS if sequential else PARALLEL_INSTRUCTIONS

    def apply_simulations(name: str, base_prompt: str) -> str:
        prompt = base_prompt
        if simulate_timeout == name:
            prompt += simulated_timeout_instructions(name)
        if simulate_conflict and name == "web-researcher":
            prompt += simulated_conflict_instructions_a()
        if simulate_conflict and name == "recency-checker":
            prompt += simulated_conflict_instructions_b()
        return prompt

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
                prompt=apply_simulations(
                    "web-researcher",
                    "You are a research assistant. Given a topic, search the web "
                    "for general/background information. "
                    + FINDING_SCHEMA_INSTRUCTIONS,
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
                prompt=apply_simulations(
                    "recency-checker",
                    "You are a recency-focused research assistant. Given a "
                    "topic, search the web for only the most recent "
                    "developments - roughly the last 30-60 days. Ignore "
                    "older/background material; that is handled by a separate "
                    "subagent. " + FINDING_SCHEMA_INSTRUCTIONS,
                ),
                tools=["WebSearch", "WebFetch"],
            ),
            "document-analyzer": AgentDefinition(
                description=(
                    "Analyzes local documents against research findings that are "
                    "supplied directly in its prompt. Use this after "
                    "web-researcher and recency-checker have both returned."
                ),
                prompt=apply_simulations(
                    "document-analyzer",
                    "You are a document analyst. You will be given prior research "
                    "findings directly in your prompt text - you have no access to "
                    "any earlier conversation, so treat the prompt as your only "
                    "source of that context. Read the specified local files and "
                    "assess how they relate to (support, contradict, or are silent "
                    "on) those findings. For each relevant thing you find in the "
                    'local files, produce a finding whose "source" is the local '
                    'file path and whose "publication_date" is that document\'s '
                    "own stated date if it has one (otherwise null - do not use "
                    "today's date as a substitute). " + FINDING_SCHEMA_INSTRUCTIONS,
                ),
                tools=["Read", "Grep", "Glob"],
            ),
        },
        system_prompt=(
            "You are a research coordinator orchestrating three subagents via "
            "the Task tool. Follow this sequence:\n"
            + call_pattern
            + "2. Once web-researcher and recency-checker have both returned, read "
            "both sets of structured findings (or error objects - see ERROR "
            "HANDLING below) yourself.\n"
            "3. Delegate to the document-analyzer subagent. In the prompt you give "
            "it, explicitly include BOTH web-researcher's and recency-checker's "
            "findings (their full JSON, not a paraphrase - or their error object "
            "if one of them failed) as plain text, plus the local path(s) to "
            "analyze. Do not assume document-analyzer can see prior subagent "
            "output on its own - subagents do not share context automatically, "
            "so you must copy the relevant findings into the prompt yourself.\n"
            "4. Once all three subagents have reported back, produce a final "
            "synthesis for the user."
            + SYNTHESIS_JSON_SHAPE_INSTRUCTIONS
            + ERROR_PROPAGATION_INSTRUCTIONS
            + CONTESTED_CLAIMS_INSTRUCTIONS
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


_JSON_BLOCK_RE = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)


def extract_findings(text: str) -> list:
    """Pull every well-formed findings array out of one or more ```json
    fenced blocks in `text` (subagent output - always a bare array).
    Malformed blocks are skipped, not fatal - a subagent producing bad JSON
    shouldn't crash the whole run."""
    findings = []
    for raw in _JSON_BLOCK_RE.findall(text):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            findings.extend(f for f in parsed if isinstance(f, dict))
    return findings


def extract_errors(text: str) -> list:
    """Pull every well-formed simulated-failure error object out of one or
    more ```json fenced blocks in `text` (a subagent's error report is a
    single object with a failure_type key, not an array)."""
    errors = []
    for raw in _JSON_BLOCK_RE.findall(text):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "failure_type" in parsed:
            errors.append(parsed)
    return errors


def extract_synthesis(text: str) -> tuple[list, list, list]:
    """Pull the coordinator's final synthesis out of `text`. Step 5 shape is
    a JSON OBJECT: {"findings": [...], "coverage_gaps": [...],
    "contested_claims": [...]}. Falls back to treating a bare array as
    findings-only, for tolerance if the model reverts to an older shape."""
    findings, gaps, contested = [], [], []
    for raw in _JSON_BLOCK_RE.findall(text):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and (
            "findings" in parsed
            or "coverage_gaps" in parsed
            or "contested_claims" in parsed
        ):
            f = parsed.get("findings", [])
            g = parsed.get("coverage_gaps", [])
            c = parsed.get("contested_claims", [])
            if isinstance(f, list):
                findings.extend(x for x in f if isinstance(x, dict))
            if isinstance(g, list):
                gaps.extend(x for x in g if isinstance(x, dict))
            if isinstance(c, list):
                contested.extend(x for x in c if isinstance(x, dict))
        elif isinstance(parsed, list):
            findings.extend(x for x in parsed if isinstance(x, dict))
    return findings, gaps, contested


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


def verify_error_propagation(
    simulate_timeout: str | None,
    subagent_errors: list,
    synthesis_findings: list,
    coverage_gaps: list,
) -> str:
    """Check that a simulated subagent failure actually shows up as
    structured error context, and that the coordinator's synthesis
    annotates it as a coverage gap rather than silently ignoring it."""
    lines = []

    if simulate_timeout is None:
        lines.append("No subagent failure was simulated for this run "
                      "(--simulate-timeout not set).")
        if coverage_gaps:
            lines.append(
                f"NOTE: {len(coverage_gaps)} coverage_gaps entr(y/ies) "
                "were reported anyway (a real/unexpected failure occurred, "
                "or the model over-reported):"
            )
            for g in coverage_gaps:
                lines.append(f"  - {g}")
        return "\n".join(lines)

    lines.append(f"Simulated failure target: {simulate_timeout}")

    if subagent_errors:
        lines.append(
            f"Structured error object received from the subagent: YES "
            f"({len(subagent_errors)} error object(s) found in subagent output)"
        )
        for e in subagent_errors:
            lines.append(
                f"  failure_type={e.get('failure_type')!r} "
                f"attempted_query={e.get('attempted_query')!r} "
                f"partial_results={len(e.get('partial_results') or [])} item(s) "
                f"error_message={e.get('error_message')!r}"
            )
    else:
        lines.append(
            "Structured error object received from the subagent: NO - "
            "the simulated-failure instructions were not followed. "
            "(Check the run transcript to see what it returned instead.)"
        )

    gap_entry = next(
        (g for g in coverage_gaps if g.get("subagent") == simulate_timeout), None
    )
    if gap_entry:
        lines.append(
            f"Coordinator's synthesis annotated this as a coverage gap: YES "
            f"-> {gap_entry}"
        )
    else:
        lines.append(
            "Coordinator's synthesis annotated this as a coverage gap: NO - "
            "the failure was not propagated into coverage_gaps. This is a "
            "pipeline defect if a failure genuinely occurred above."
        )

    partial_sources = set()
    for e in subagent_errors:
        for pr in e.get("partial_results") or []:
            if isinstance(pr, dict) and pr.get("source"):
                partial_sources.add(pr["source"])
    if partial_sources:
        synthesis_sources = {f.get("source") for f in synthesis_findings}
        carried_over = partial_sources & synthesis_sources
        lines.append(
            f"Partial results from the failed subagent: {len(partial_sources)} "
            f"source(s); carried into final findings: {len(carried_over)}/"
            f"{len(partial_sources)}"
        )

    return "\n".join(lines)


def verify_contested_claims(
    simulate_conflict: bool, synthesis_findings: list, contested_claims: list
) -> str:
    """Check that a simulated conflict (a) had both conflicting values
    survive into the merged findings, unarbitrarily reduced to one, and
    (b) got flagged in contested_claims rather than silently listed as if
    the two findings simply agreed."""
    lines = []

    if not simulate_conflict:
        lines.append("No conflict was simulated for this run "
                      "(--simulate-conflict not set).")
        if contested_claims:
            lines.append(
                f"NOTE: {len(contested_claims)} contested_claims entr(y/ies) "
                "were reported anyway (a real conflict was found in genuine "
                "research, or the model over-reported):"
            )
            for c in contested_claims:
                lines.append(f"  - {c}")
        return "\n".join(lines)

    synthesis_sources = {f.get("source") for f in synthesis_findings}
    a_present = CONFLICT_SOURCE_A in synthesis_sources
    b_present = CONFLICT_SOURCE_B in synthesis_sources

    lines.append(f"Conflicting finding from web-researcher (source A) preserved "
                 f"in synthesis findings: {'YES' if a_present else 'NO'}")
    lines.append(f"Conflicting finding from recency-checker (source B) preserved "
                 f"in synthesis findings: {'YES' if b_present else 'NO'}")

    if a_present and b_present:
        lines.append("Neither value was arbitrarily dropped - both conflicting "
                     "statistics survived into the merged findings.")
    else:
        lines.append("At least one conflicting value did NOT survive into the "
                     "merged findings - the coordinator may have arbitrarily "
                     "picked one source over the other.")

    def references_both(claim: dict) -> bool:
        sources = {
            v.get("source")
            for v in (claim.get("conflicting_values") or [])
            if isinstance(v, dict)
        }
        return CONFLICT_SOURCE_A in sources and CONFLICT_SOURCE_B in sources

    flagged = next((c for c in contested_claims if references_both(c)), None)
    if flagged:
        lines.append(f"Conflict explicitly flagged in contested_claims: YES -> {flagged}")
    else:
        lines.append(
            "Conflict explicitly flagged in contested_claims: NO - the "
            "coordinator did not annotate this as a contested claim, even "
            "if both values happen to be present in findings. This is a "
            "pipeline defect if both values were genuinely reported."
        )

    return "\n".join(lines)


async def main() -> None:
    raw_args = sys.argv[1:]
    sequential = "--sequential" in raw_args
    simulate_conflict = "--simulate-conflict" in raw_args

    model = DEFAULT_MODEL
    if "--model" in raw_args:
        idx = raw_args.index("--model")
        try:
            model = raw_args[idx + 1]
        except IndexError:
            print("--model requires a value, e.g. --model claude-sonnet-5")
            raise SystemExit(1)

    simulate_timeout = None
    if "--simulate-timeout" in raw_args:
        idx = raw_args.index("--simulate-timeout")
        try:
            simulate_timeout = raw_args[idx + 1]
        except IndexError:
            simulate_timeout = None
        if simulate_timeout not in VALID_SUBAGENTS:
            print(
                "--simulate-timeout requires one of: "
                + ", ".join(VALID_SUBAGENTS)
            )
            raise SystemExit(1)

    if simulate_timeout and simulate_conflict:
        print(
            "--simulate-timeout and --simulate-conflict cannot be combined "
            "in one run - each replaces a subagent's real task with a fixed "
            "scripted response, and running both at once would make it "
            "unclear which effect any given result is testing."
        )
        raise SystemExit(1)

    # Positional args = anything left over that isn't a flag or a flag's value.
    flags_with_values = {"--model", "--simulate-timeout"}
    skip_next = False
    args = []
    for a in raw_args:
        if skip_next:
            skip_next = False
            continue
        if a in flags_with_values:
            skip_next = True
            continue
        if a.startswith("--"):
            continue
        args.append(a)

    if not args:
        print(
            'Usage: python coordinator.py "<research task for the coordinator>" '
            "[--sequential] [--model <model-name>] "
            "[--simulate-timeout <web-researcher|recency-checker|document-analyzer>] "
            "[--simulate-conflict]"
        )
        raise SystemExit(1)

    task_prompt = args[0]
    options = build_options(
        sequential=sequential,
        model=model,
        simulate_timeout=simulate_timeout,
        simulate_conflict=simulate_conflict,
    )

    OUTPUT_DIR.mkdir(exist_ok=True)
    # One file per run, timestamped so repeated runs don't overwrite each
    # other - useful for comparing runs (e.g. before/after a prompt change,
    # parallel vs. sequential, or Opus vs. Sonnet) side by side later.
    mode_tag = "sequential" if sequential else "parallel"
    fail_tag = f"-fail_{simulate_timeout}" if simulate_timeout else ""
    conflict_tag = "-conflict" if simulate_conflict else ""
    run_file = (
        OUTPUT_DIR
        / f"run-{time.strftime('%Y%m%d-%H%M%S')}-{mode_tag}{fail_tag}{conflict_tag}.txt"
    )

    print(f"Running ({mode_tag})... output is being written to {run_file}")
    if simulate_timeout:
        print(f"Simulating a timeout in subagent: {simulate_timeout}")
    if simulate_conflict:
        print("Simulating a source conflict between web-researcher and recency-checker")

    # Text collected per role, with real newlines (not the escaped \n you'd
    # get from repr()), so the JSON-block regex above can actually match
    # multi-line findings arrays after the run completes.
    subagent_texts = []
    coordinator_texts = []

    start = time.monotonic()
    with run_file.open("w", encoding="utf-8") as f:
        f.write(f"MODE: {mode_tag}\n")
        f.write(f"MODEL: {model}\n")
        f.write(f"SIMULATE_TIMEOUT: {simulate_timeout}\n")
        f.write(f"SIMULATE_CONFLICT: {simulate_conflict}\n")
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
        subagent_errors = []
        for t in subagent_texts:
            subagent_findings.extend(extract_findings(t))
            subagent_errors.extend(extract_errors(t))

        synthesis_findings, coverage_gaps, contested_claims = [], [], []
        for t in coordinator_texts:
            sf, sg, sc = extract_synthesis(t)
            synthesis_findings.extend(sf)
            coverage_gaps.extend(sg)
            contested_claims.extend(sc)

        attribution_report = verify_attribution(subagent_findings, synthesis_findings)
        f.write("\n" + "=" * 80 + "\n")
        f.write("VERIFICATION: source attribution preserved through synthesis\n")
        f.write("=" * 80 + "\n")
        f.write(attribution_report + "\n")

        # --- Step 4: automated error-propagation verification ----------
        error_report = verify_error_propagation(
            simulate_timeout, subagent_errors, synthesis_findings, coverage_gaps
        )
        f.write("\n" + "=" * 80 + "\n")
        f.write("VERIFICATION: error propagation / coverage-gap annotation\n")
        f.write("=" * 80 + "\n")
        f.write(error_report + "\n")

        # --- Step 5: automated contested-claims verification -----------
        conflict_report = verify_contested_claims(
            simulate_conflict, synthesis_findings, contested_claims
        )
        f.write("\n" + "=" * 80 + "\n")
        f.write("VERIFICATION: conflicting sources preserved and flagged\n")
        f.write("=" * 80 + "\n")
        f.write(conflict_report + "\n")

    print(f"Done in {elapsed:.2f}s ({mode_tag}). Output written to {run_file}")
    print("\n--- Attribution verification ---")
    print(attribution_report)
    print("\n--- Error propagation verification ---")
    print(error_report)
    print("\n--- Contested claims verification ---")
    print(conflict_report)


if __name__ == "__main__":
    anyio.run(main)
