import { client } from './client.js'

const MODEL = 'claude-sonnet-5'

/**
 * Sends the messages array to Claude and returns the assistant's reply text.
 *
 * Kept intentionally narrow (array in, string out), so the calling component
 * doesn't need to know anything about the Anthropic SDK's request/response
 * shape. Swapping providers later just means rewriting this function's
 * internals — callers don't change.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages - the entire conversation history so far, including the user's message
 * @returns {Promise<string>} - the assistant's reply text
 */
export async function sendMessage(messages) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: messages
  })

  return response.content[0].text
}
