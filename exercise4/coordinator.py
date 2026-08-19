"""
Exercise 4 - Step 1: Coordinator agent with two delegated subagents.

Demonstrates:
  - A coordinator whose allowed_tools includes "Task" (required to delegate
    work to subagents at all).
  - Two subagents, each scoped to only the tools its job needs
    (least-privilege tool access).
  - Explicit context passing: the coordinator is instructed to paste the
    web-researcher's findings directly into the prompt it sends to the
    document-analyzer, because subagents spawned via Task do NOT
    automatically inherit the coordinator's conversation history. Each
    Task call starts a fresh context containing only the prompt text given
    to it at call time.

Requirements:
  pip install claude-agent-sdk python-dotenv
  A .env file in this directory containing:
    ANTHROPIC_API_KEY=sk-ant-...
  (see .env.example)

Usage:
  python coordinator.py "Research <topic> and cross-check it against the local docs/ folder"
"""

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


def build_options() -> ClaudeAgentOptions:
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
                    "Searches the web for current information on a topic and "
                    "returns findings with sources/URLs. Use this first, before "
                    "any local document analysis."
                ),
                prompt=(
                    "You are a research assistant. Given a topic, search the web "
                    "and return a concise summary of findings. For every claim, "
                    "cite the source URL it came from. If a search turns up "
                    "nothing useful, say so explicitly rather than guessing."
                ),
                tools=["WebSearch", "WebFetch"],
            ),
            "document-analyzer": AgentDefinition(
                description=(
                    "Analyzes local documents against research findings that are "
                    "supplied directly in its prompt. Use this after the "
                    "web-researcher subagent has returned findings."
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
            "You are a research coordinator orchestrating two subagents via the "
            "Task tool. Follow this sequence:\n"
            "1. Delegate to the web-researcher subagent to gather findings on the "
            "user's topic.\n"
            "2. Read the web-researcher's returned findings yourself.\n"
            "3. Delegate to the document-analyzer subagent. In the prompt you give "
            "it, explicitly include the web-researcher's findings as plain text, "
            "plus the local path(s) to analyze. Do not assume the "
            "document-analyzer can see the web-researcher's output on its own - "
            "subagents do not share context automatically, so you must copy the "
            "relevant findings into the prompt yourself.\n"
            "4. Once both subagents have reported back, produce a final summary "
            "for the user that clearly attributes each piece of information to "
            "the subagent (and, for document findings, the file) it came from."
        ),
        model="claude-sonnet-5",
    )


async def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: python coordinator.py "<research task for the coordinator>"')
        raise SystemExit(1)

    task_prompt = sys.argv[1]
    options = build_options()

    OUTPUT_DIR.mkdir(exist_ok=True)
    # One file per run, timestamped so repeated runs don't overwrite each
    # other - useful for comparing runs (e.g. before/after a prompt change,
    # or Opus vs. Sonnet) side by side later.
    run_file = OUTPUT_DIR / f"run-{time.strftime('%Y%m%d-%H%M%S')}.txt"

    print(f"Running... output is being written to {run_file}")

    with run_file.open("w", encoding="utf-8") as f:
        f.write(f"PROMPT: {task_prompt}\n")
        f.write("=" * 80 + "\n\n")
        async for message in query(prompt=task_prompt, options=options):
            f.write(repr(message) + "\n\n")

    print(f"Done. Output written to {run_file}")


if __name__ == "__main__":
    anyio.run(main)
