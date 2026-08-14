/**
 * Structured error type for tool handlers to throw instead of a plain Error.
 *
 * runAgentLoop catches these specifically and passes the structured fields
 * (errorCategory, isRetryable) through to Claude inside the tool_result
 * content, rather than just a flat message string. The system prompt in
 * sendMessage.js tells Claude how to interpret these fields — retry once
 * for transient failures, explain and ask for corrected input on
 * validation failures, stop and explain (no retry) on permission failures.
 *
 * A plain Error thrown from a handler still works (runAgentLoop falls back
 * to a generic, non-categorized tool_result) — ToolError is for when a
 * handler wants to tell Claude specifically what kind of failure this was.
 */
export class ToolError extends Error {
  /**
   * @param {string} message - human-readable description of what went wrong
   * @param {Object} options
   * @param {'transient'|'validation'|'permission'} options.errorCategory
   * @param {boolean} options.isRetryable
   */
  constructor(message, { errorCategory, isRetryable }) {
    super(message)
    this.name = 'ToolError'
    this.errorCategory = errorCategory
    this.isRetryable = isRetryable
  }
}
