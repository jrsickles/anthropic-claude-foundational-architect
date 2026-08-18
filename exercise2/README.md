# Exercise 2: Configure Claude Code for a Team Development Workflow

**Objective:** Practice configuring CLAUDE.md hierarchies, custom slash commands,
path-specific rules, and MCP server integration for a multi-developer project.

This README summarizes what was configured and verified for each of the five steps
in this exercise, along with the reasoning behind each configuration choice.

## Step 1 — Project-level CLAUDE.md

Created `CLAUDE.md` at the repository root with universal coding standards (PHP,
PSR-12, `declare(strict_types=1);`, docblocks) and testing conventions (PHPUnit,
behavior-driven test names, co-located `**/*.test.*` files).

**Why this satisfies "consistently applied across all team members":** CLAUDE.md is
auto-loaded by Claude Code at the start of every session run from this project
directory or a subdirectory of it, and because the file is committed to git, every
developer who clones the repo gets identical instructions with zero personal setup.
This is the key distinction from personal-scope config (`~/.claude/CLAUDE.md`) or
gitignored local overrides (`CLAUDE.local.md`): project CLAUDE.md is shared and
versioned, not per-machine.

**Verified via:** `claude --debug` startup logs showing the file loaded
(`[Project] .../CLAUDE.md`), and generated code across later steps consistently
following its conventions without being re-stated in prompts.

## Step 2 — Path-specific rules (`.claude/rules/`)

Created two rule files with YAML frontmatter `paths` globs:

- `.claude/rules/api-conventions.md` — scoped to `src/api/**/*` (response envelope
  shape, status code discipline, boundary validation, rate limiting on writes).
- `.claude/rules/testing-conventions.md` — scoped to `**/*.test.*` (behavior-named
  tests, Arrange/Act/Assert, no timing-based waits, don't mock what you don't own).

**Why this is different from CLAUDE.md:** rules load conditionally, only when
Claude Code is working on a file matching the glob, keeping unrelated context out of
the conversation (e.g., testing conventions don't load while editing an unrelated
API file, and vice versa).

**Verified via:** editing/referencing files under each glob and confirming only the
matching rule loaded (checked with `/memory`); confirming neither rule loads for an
unrelated file (e.g. `README.md`); a required session restart after adding new rule
files, since Claude Code discovers rules at startup, not mid-session.

## Step 3 — Project-scoped skill (`.claude/skills/`)

Created `.claude/skills/code-review/SKILL.md` with:

- `context: fork` — runs the skill as an isolated subagent; only its final result
  returns to the main conversation, keeping the skill's own file reads and reasoning
  out of the main session's context.
- `allowed-tools: ["Read", "Grep", "Glob"]` — restricts the skill to read-only
  operations; it cannot `Write`, `Edit`, or run `Bash`.

**Verified via:** a real transcript showing the skill running as a background agent
("Skill(code-review)... Running in the background... Agent finished · 23s"), and a
deliberate negative test — asking the skill to also fix what it found. It correctly
refused ("the code-review skill is read-only and can't apply fixes itself"); the
*main session* then applied the fix itself, outside the skill's tool restriction.
This distinguishes what `allowed-tools` actually scopes: the skill's subagent, not
the main session that consumes its output.

## Step 4 — MCP server configuration (project + personal)

**Project-scoped**, committed to the repo — `.mcp.json`:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"],
      "env": { "PGPASSWORD": "${PGPASSWORD}" }
    }
  }
}
```

Credentials are never committed — `${DATABASE_URL}` and `${PGPASSWORD}` are expanded
from the local shell environment at launch.

**Personal-scoped**, machine-local, never shared — `~/.claude.json`, under this
project's entry:

```json
{
  "mcpServers": {
    "experimental-notes": {
      "command": "npx",
      "args": ["-y", "@some-org/experimental-mcp-server"]
    }
  }
}
```

**Trust model encountered during setup:** `.mcp.json` servers require explicit
per-project approval before they load — an undecided state is silent (the server
simply doesn't appear) rather than an error, by design, since a repo's `.mcp.json`
is otherwise a plausible supply-chain vector for a malicious server planted by
anyone with write access. Resolved via `claude mcp reset-project-choices` followed
by approving the live prompt on next launch.

**Verified via:** `/mcp` showing both `postgres` (Project MCPs,
`.mcp.json`) and `experimental-notes` (Local MCPs, scoped
`[project: .../exercise2]`) connected simultaneously; confirming env var expansion
by checking the resolved connection args contained the real `DATABASE_URL` value
rather than the literal placeholder string.

## Step 5 — Plan mode vs. direct execution

Tested across three tasks of increasing ambiguity/blast-radius, all executed for
real against this repo (not hypothetically):

1. **Single-file bug fix** (`UserController::show()` 404 handling) — low ambiguity,
   plan mode adds little beyond direct execution.
2. **Multi-file library migration** (introducing a shared `ApiResponse` envelope
   helper + migrating the controller to use it, plus standing up PHPUnit tooling
   from scratch) — plan mode surfaced a genuine structural decision before writing
   any code: whether user lookup should go through a
   `UserRepositoryInterface`-backed repository or a bare inline array. Caught and
   resolved before multiple files were shaped around the wrong abstraction.
3. **New feature, multiple valid implementations** (rate limiting on write
   endpoints) — plan mode's clearest value case. It distinguished between a
   consequential, hard-to-reverse choice (deferred to the user, in Scenario 2) and a
   genuinely reversible one behind an interface seam (fixed-window vs. token-bucket
   rate limiting — decided independently here, with the tradeoff documented inline
   rather than silently picked).

**Result:** both multi-file plans executed cleanly — 6/6 tests passing after Scenario
2, 19/19 after Scenario 3 — and both included self-verifying regression-test proof
steps (temporarily break the fix, confirm the test fails, then revert).

**Takeaway:** plan mode's value scales with ambiguity and blast radius, not with
raw task size or file count. A large but mechanical change may not need it; a small
but structurally ambiguous one might.

## Repository structure

```
.
├── CLAUDE.md                              # Step 1 — project-wide standards
├── CLAUDE.local.md                        # Local override, not committed
├── .mcp.json                              # Step 4 — project MCP servers
├── .claude/
│   ├── rules/
│   │   ├── api-conventions.md             # Step 2 — scoped to src/api/**/*
│   │   └── testing-conventions.md         # Step 2 — scoped to **/*.test.*
│   └── skills/
│       └── code-review/SKILL.md           # Step 3 — forked, read-only skill
├── composer.json / phpunit.xml            # Added during Step 5, Scenario 2
└── src/api/                               # UserController + supporting classes
    └── ...                                # built out across Steps 4-5 scenarios
```
