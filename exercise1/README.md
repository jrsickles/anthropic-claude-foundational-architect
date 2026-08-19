# Claude Architect Exam Exercise 1: Multi-Tool Agent with Escalation Logic

A Vue 3 + Vite front end (no backend) that drives a hand-rolled agentic loop against the Anthropic
Messages API — tool use, structured error handling, and a hard-coded business-rule guardrail, with
every layer of internal state visible in the UI for inspection while learning.

## Project Setup

```sh
npm install
npm run dev
```

Requires a `.env` file at the project root with `VITE_ANTHROPIC_API_KEY=sk-ant-...` (gitignored at
the repo root, not committed).

```sh
npm run lint      # ESLint, auto-fix
npm run format    # Prettier, writes src/
npm run build      # production build
npm run preview     # preview the production build
```

Linting and formatting also run automatically on `git commit` via a Husky pre-commit hook scoped to
this project directory (`lint-staged`, configured in `package.json`).

## Architecture

The project is organized by dependency direction, not just by file type — lower layers never know
Vue exists, so they stay swappable and testable independent of the UI.

```
src/
  api/
    client.js          Anthropic SDK client instantiation (dangerouslyAllowBrowser, since there's
                        no backend — the API key ships in the client bundle by necessity here)
    sendMessage.js       Thin, stateless wrapper around client.messages.create(). Takes a messages
                          array + tools array + the system prompt; returns the raw Message object.
  agent/
    runAgentLoop.js       The hand-rolled agentic loop. Framework-agnostic (plain arrays/objects,
                           no Vue refs). Drives the full tool-use round trip for one user
                           submission, including the business-rule guardrail.
    runToolHandler.js      Runs a single tool handler safely, catches ToolError vs. generic errors,
                            and formats the result into the tool_result shape Claude expects.
  tools/
    index.js                Registry only: aggregates every tool's schema (for the `tools` array
                             sent to the API) and every tool's handler (for execution lookup).
    toolError.js              Structured error class (errorCategory, isRetryable) tool handlers
                               throw instead of a plain Error.
    checkOrderStatus.js         Tool definition + handler pairs, one file per tool.
    checkAccountBalance.js
    searchHelpArticles.js
    escalateToHuman.js
    issueRefund.js
  composables/
    useChat.js               Vue composable. Owns all reactive chat state (messages, status, error,
                              payload, progress log) and calls into agent/ — no API or tool logic
                              lives here.
  components/
    ChatInterface.vue          Presentation only: textarea, submit/clear buttons, response display,
                                and three live JSON/text panels into the composable's state.
```

## Steps and decisions

### Project scaffolding

- Started from the stock Vite + Vue 3 SFC template (already present in the connected folder).
- Built a single-file chat UI first (textarea, response box, submit/clear buttons, a live JSON
  state block) to establish the Vue reactivity model — `ref`/`computed`, template bindings, and how
  mutating a `ref`'s `.value` automatically propagates to every dependent computed and the DOM —
  before introducing any API or agent complexity.
- Moved that markup into a proper Vue SFC (`ChatInterface.vue`) and extracted state/logic into a
  composable (`useChat.js`) once the reactivity model was understood, matching Vue's convention
  that components stay presentation-only and composables own reactive state + behavior.

### API layer

- Added the `@anthropic-ai/sdk` and split it into `api/client.js` (SDK instantiation) and
  `api/sendMessage.js` (the one API call), so the calling code never touches SDK internals directly
  and a future provider swap would only mean rewriting `sendMessage.js`.
- `sendMessage.js` evolved from returning a plain reply string to returning the full `Message`
  object once tool use was introduced, since the caller needs `stop_reason` and the raw `content`
  block array to drive the agentic loop.
- Added a `system` parameter (the top-level `system` field, distinct from the `role: "system"`
  mid-conversation message feature) carrying instructions for how to interpret structured tool
  errors — see Structured tool errors below.
- `tool_choice: { type: 'auto', disable_parallel_tool_use: false }` — parallel tool calls are
  explicitly enabled, confirmed working via live testing (see Multi-concern testing below).

### Message chaining

- Established that the Messages API is stateless per request — the full conversation history must
  be resent on every call — and that `sendMessage.js`'s `messages` parameter must be a plain array
  (never the Vue `ref` itself) with each entry sanitized down to `{role, content}`, stripping the
  UI-only fields (`timestamp`, `status`) that `messages.value` carries for display purposes.
- Decided that failed messages should be marked with a `status` field and excluded from the payload
  sent to the API on the next turn, rather than popped from history — since the API has no memory
  of its own, keeping a failed message in the local record preserves an honest chat log and doesn't
  cost anything on retry, whereas deleting it silently erases the user's own record that they sent
  something.

### Tool definitions (project step 1)

- Defined four tools initially, later a fifth (`issue_refund`, added in step 4): `check_order_status`,
  `check_account_balance`, `search_help_articles`, `escalate_to_human`, `issue_refund`.
- `check_order_status` and `check_account_balance` were deliberately designed as a disambiguation
  pair — same "single ID lookup" shape, cross-referencing negative-boundary language in each
  description ("do NOT use this tool for billing — use check_account_balance instead") — since a
  tool's `description` field is the primary signal Claude uses to select between similar tools, not
  documentation for humans.
- Each tool file exports two flat, top-level items: the schema object (`name`, `description`,
  `input_schema`) and a standalone handler function — not nested inside a wrapper object — so that
  `tools/index.js` can build both the `tools` array and the `toolHandlers` map without unwrapping.
- `tools/index.js` is a pure registry/aggregator: it knows about every tool file so nothing else
  has to.

### Agentic loop (project step 2)

- `runAgentLoop.js` explicitly branches on `response.stop_reason`: `'end_turn'` returns the final
  text, `'tool_use'` runs the requested tool(s) and loops again, any other reason (`max_tokens`,
  `stop_sequence`) falls through without silently treating a truncated response as a complete one.
- A hard `MAX_TURNS` cap (5) prevents an unbounded loop if the model keeps calling tools without
  ever reaching a terminal stop reason; hitting the cap returns a canned "escalating" message — the
  seam where real escalation logic plugs in.
- Multiple simultaneous `tool_use` blocks (parallel tool calls) are handled via `Promise.all`, not
  assumed to be singular.
- An `onProgress` callback fires at each meaningful step (`thinking`, `tool_call`, `tool_result`,
  `tool_error`, `business_rule`, `max_turns_exceeded`) so the UI can show live progress rather than
  waiting silently for the whole exchange to resolve — surfaced in `useChat.js` as an
  accumulating, per-submission activity log (`responseString`).
- Kept intentionally Vue-agnostic: takes and returns plain arrays/objects, never mutates the
  `messages` array it's handed, and returns `{ text, messages, turns }` on every path.

### Structured tool errors (project step 3)

- Added `tools/toolError.js`: a `ToolError` class carrying `errorCategory`
  (`'transient'|'validation'|'permission'`) and `isRetryable` (boolean), for handlers to throw
  instead of a plain `Error` when they want to tell Claude specifically what kind of failure
  occurred.
- `runToolHandler.js` catches `ToolError` specifically and passes the structured fields through in
  the `tool_result` content as JSON, rather than a flat message string; a plain `Error` still works
  but falls back to unstructured content since there's no category to report.
- The system prompt (`sendMessage.js`) instructs Claude on how to react to each category: retry
  once (and only once) for `transient`/retryable failures, ask the user for corrected input on
  `validation` failures without retrying, and explain/offer escalation on `permission` failures
  without retrying.
- Tested end-to-end via sentinel `order_id` values in `checkOrderStatus.js`
  (`FAIL-TRANSIENT`/`FAIL-VALIDATION`/`FAIL-PERMISSION`) that deliberately throw each category.
  Verified live: a transient failure was retried exactly once before escalating; a validation
  failure was never retried and the user was asked for a corrected order ID; a permission failure
  was never retried and the user was offered (not auto-routed to) escalation.

### Programmatic business-rule guardrail (project step 4)

- Added a fifth tool, `issue_refund(order_id, amount)`, specifically to give the guardrail a
  state-changing action to intercept — the existing four tools are all read-only lookups.
- Deliberately chose a hard, code-enforced guardrail over a prompt-driven one: `runAgentLoop.js`
  intercepts any `issue_refund` call where `amount > REFUND_THRESHOLD` _before_ the real handler
  ever runs, swaps in `escalate_to_human`'s handler with a properly reconstructed input
  (`{reason, summary}`, not the refund's original arguments), and returns a single, explicit
  `tool_result` stating the refund was **not** processed and was escalated — deterministic, and not
  something a differently-phrased user request could talk the model around.
- Fixed several bugs found during review along the way: comparing `block.name` (the tool_use
  block's actual name) rather than `handler.name` (the JS function identifier, which is a different
  string entirely); ensuring exactly one `tool_result` per `tool_use_id` (an earlier draft
  accidentally produced two — one malformed, in the wrong message role); and correcting a
  parameter-shape mismatch between `runToolHandler`'s call sites and its signature that had been
  silently swallowing progress events.
- Extracted the shared "run a handler safely and format the result for Claude" logic into
  `agent/runToolHandler.js` rather than `tools/index.js`, since that logic depends on the Anthropic
  API's `tool_result`/`is_error` message shape — orchestration knowledge that belongs with the
  agent loop, not the tools registry.

### Multi-concern testing (project step 5)

Verified live, in order of complexity:

- A message combining two lookups (order status + account balance) produced two `tool_call` events
  under a single turn — genuine parallel tool calling, not sequential — with a correctly unified
  final response and no disambiguation errors between the two similarly-shaped tools.
- A message combining a lookup with a refund request caused Claude to conservatively verify order
  status before acting on the refund, asking for confirmation rather than immediately calling
  `issue_refund` — reasonable emergent caution, not something explicitly coded.
- A three-concern message (lookup + over-threshold refund + expressed frustration) was decomposed
  correctly across turns; once confirmed, the refund attempt correctly triggered the guardrail
  (swap to escalation, no false claim that the refund was issued), and the final synthesized
  response coherently addressed the order status, the escalation outcome, and the earlier
  frustration in one coherent reply.

## Tooling

- **ESLint** (flat config, `eslint.config.js`): `eslint-plugin-vue` recommended rules +
  `@vue/eslint-config-prettier` to disable any formatting rules that would conflict with Prettier.
- **Prettier** (`.prettierrc.json`): no semicolons, single quotes, 2-space indent — matches the
  Vite/Vue scaffold's existing style.
- **Husky + lint-staged**: a pre-commit hook runs ESLint (`--fix`) and Prettier against staged
  files only. Scoped to this project directory specifically (`--cwd exercise1`), since the git repo
  root is one level above this folder and the hook would otherwise fire for unrelated files
  elsewhere in the repo.
  - Note: Husky v9 sets `core.hooksPath` rather than writing into `.git/hooks/` (v4 behavior). The
    `prepare` script (`cd .. && husky exercise1/.husky`) runs from the repo root specifically,
    since husky's own install step only detects a `.git` directory relative to its current working
    directory and npm's `prepare` lifecycle script otherwise runs from this package's directory,
    not the repo root.

## Known follow-ups (not yet done)

- **Message-shape abstraction.** `runAgentLoop.js` currently pushes bare `{role, content}` message
  objects (the exact shape the API wants), while `useChat.js`'s own messages carry extra UI-only
  fields (`timestamp`, `status`). Where metadata enrichment should happen — inside the loop, or as
  a decorating step in `useChat.js` — is an open question flagged for later.
- Structured `ToolError` handling (retryable/validation/permission) was only implemented and tested
  on `checkOrderStatus.js` as the reference pattern; it was deliberately not replicated to the
  other tool handlers, since one fully-tested example was judged sufficient for this exercise.
