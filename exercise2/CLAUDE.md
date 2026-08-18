# Project: Exercise 2 — Team Development Workflow

## Purpose
This file defines universal coding standards and conventions that apply to
every part of this repository, for every developer and every Claude Code
session started within this project.

## Coding Standards
- Language: PHP (primary). Follow PSR-12 coding style.
- Use strict typing: `declare(strict_types=1);` at the top of every PHP file.
- Prefer composition over inheritance; avoid deep class hierarchies.
- All public methods and classes require docblocks describing purpose,
  parameters, and return types.
- No commented-out code in commits — delete it or explain why it's kept.
- Commit messages: imperative mood, e.g. "Add rate limiter to API client"
  (not "Added" or "Adds").

## Testing Conventions
- Every new feature or bug fix must include a corresponding test.
- Tests live alongside the code they test, following the pattern
  `**/*.test.*` (see .claude/rules/ for path-specific testing rules).
- Use PHPUnit for PHP tests; aim for behavior-driven test names
  (e.g. `test_returns_404_when_resource_not_found`).
- Do not mock what you don't own — wrap third-party calls in an adapter
  and mock the adapter instead.

## General Working Agreement
- When in doubt about an ambiguous requirement, ask before implementing.
- Prefer small, reviewable diffs over large sweeping changes.
- Never commit secrets, credentials, or `.env` files.

## Verification Note (Exercise 2, Step 1)
This file is committed to the repository root so it loads automatically
for every team member who runs Claude Code from this project directory —
that's what "consistently applied across all team members" means in
practice: it's shared via version control, not configured per-person.
