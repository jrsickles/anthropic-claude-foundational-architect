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

Requirements:
  pip install claude-agent-sdk python-dotenv
  A .env file in this directory containing:
    ANTHROPIC_API_KEY=sk-ant-...
  (see .env.example)

Usage:
  python coordinator.py "Research <topic> and cross-check it against the local docs/ folder"
  python coordinator.py "Research <topic> and cross-check it against the local docs/ folder" --sequential
  python coordinator.py "..." --model claude-haiku-4-5   # cheapest tier - use when
                                                          # testing tool-call plumbing
                                                          # (e.g. parallelism), not when
                                                          # the research quality matters
"""

DEFAULT_MODEL = "claude-haiku-4-5"

import os
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
                    "topic and returns findings with sources/URLs."
                ),
                prompt=(
                    "You are a research assistant. Given a topic, search the web "
                    "and return a concise summary of findings. For every claim, "
                    "cite the source URL it came from. If a search turns up "
                    "nothing useful, say so explicitly rather than guessing."
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
                    "subagent. For every claim, cite the source URL and its "
                    "publication date if available. If nothing recent is "
                    "found, say so explicitly rather than guessing."
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
                    "on) those findings. Cite the specific file and, where "
                    "possible, the line or section you're drawing from."
                ),
                tools=["Read", "Grep", "Glob"],
            ),
        },
        system_prompt=(
            "You are a research coordinator orchestrating three subagents via "
            "the Task tool. Follow this sequence:\n"
            + call_pattern
            + "2. Once web-researcher and recency-checker have both returned, read "
            "both sets of findings yourself.\n"
            "3. Delegate to the document-analyzer subagent. In the prompt you give "
            "it, explicitly include BOTH web-researcher's and recency-checker's "
            "findings as plain text, plus the local path(s) to analyze. Do not "
            "assume document-analyzer can see prior subagent output on its own - "
            "subagents do not share context automatically, so you must copy the "
            "relevant findings into the prompt yourself.\n"
            "4. Once all three subagents have reported back, produce a final "
            "summary for the user that clearly attributes each piece of "
            "information to the subagent (and, for document findings, the file) "
            "it came from."
        ),
        model=model,
    )


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

    start = time.monotonic()
    with run_file.open("w", encoding="utf-8") as f:
        f.write(f"MODE: {mode_tag}\n")
        f.write(f"MODEL: {model}\n")
        f.write(f"PROMPT: {task_prompt}\n")
        f.write("=" * 80 + "\n\n")
        async for message in query(prompt=task_prompt, options=options):
            f.write(repr(message) + "\n\n")
        elapsed = time.monotonic() - start
        f.write("=" * 80 + "\n")
        f.write(f"WALL-CLOCK DURATION: {elapsed:.2f}s ({mode_tag})\n")

    print(f"Done in {elapsed:.2f}s ({mode_tag}). Output written to {run_file}")


if __name__ == "__main__":
    anyio.run(main)
