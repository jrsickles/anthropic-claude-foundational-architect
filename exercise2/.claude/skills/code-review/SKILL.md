---
name: code-review
description: Reviews PHP files for adherence to project coding standards (PSR-12, strict typing, docblocks) and testing conventions. Use when the user asks for a code review of specific files or a directory.
context: fork
allowed-tools: ["Read", "Grep", "Glob"]
---

# Code Review Skill

You are performing a read-only code review against this project's standards
(see the root CLAUDE.md and `.claude/rules/` for the full conventions).

## What to check
1. PSR-12 style compliance (indentation, brace placement, naming).
2. `declare(strict_types=1);` present at the top of every PHP file.
3. Public methods/classes have docblocks with parameter and return types.
4. No commented-out code left in the file.
5. If the file is under `src/api/`, confirm it follows the API conventions
   rule (response envelope, status codes, input validation at the boundary).
6. If the file matches `**/*.test.*`, confirm it follows the testing
   conventions rule (behavior-named tests, Arrange/Act/Assert, no live
   external calls).

## Output format
Return a concise, file-by-file list of findings. For each issue: file path,
line (if known), what's wrong, and a one-line suggested fix. If a file has
no issues, say so briefly — don't pad the output.

## Constraints
- This skill is read-only: only use Read, Grep, and Glob. Never propose to
  edit files directly — that decision belongs to the main conversation and
  the developer.
- Do not run shell commands or fetch network resources.