import { client } from './client.js'

const MODEL = 'claude-sonnet-5'

const SYSTEMPROMPT =
  'You are a customer support agent with access to tools for looking up order status, checking account balances, searching help articles, and escalating to a human agent. ' +
  'When a tool call fails, the tool_result will contain an error object with three fields: errorCategory ("transient", "validation", or "permission"), isRetryable (true or false), and a human-readable message. ' +
  'If isRetryable is true, you may retry the same tool call once. If it fails again, stop retrying and either try a different approach or explain the issue to the user — do not retry more than once for the same call. ' +
  'If isRetryable is false, do not retry. For "validation" errors, the problem is usually with the input provided (e.g. a missing or malformed ID) — ask the user for corrected information rather than retrying with the same input. For "permission" errors, explain to the user that you\'re unable to access that information and suggest they contact support directly if needed — do not attempt the call again. ' +
  "If you're unsure how to proceed after a tool failure, or if the user seems frustrated, use escalate_to_human rather than guessing."

/**
 * Sends the messages array to Claude and returns the assistant's reply text.
 *
 * Kept intentionally narrow (array in, string out), so the calling component
 * doesn't need to know anything about the Anthropic SDK's request/response
 * shape. Swapping providers later just means rewriting this function's
 * internals — callers don't change.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages - the entire conversation history so far, including the user's message
 * @param {Array<{name: string, description: string, input_schema: {type: 'object', properties: {}}}>} tools - the tools the assistant can use to help the user
 * @returns {Promise<Message>} - the assistant's reply text
 */
export async function sendMessage(messages, tools) {
  return client.messages.create({
    max_tokens: 1024,
    messages: messages,
    model: MODEL,
    system: SYSTEMPROMPT,
    tool_choice: { type: 'auto', disable_parallel_tool_use: false },
    tools: tools
  })
}
