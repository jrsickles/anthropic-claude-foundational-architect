import { client } from './client.js'

const MODEL = 'claude-sonnet-4-5'

/**
 * Sends a single user message to Claude and returns the assistant's reply text.
 *
 * Kept intentionally narrow (string in, string out) so the calling component
 * doesn't need to know anything about the Anthropic SDK's request/response
 * shape. Swapping providers later just means rewriting this function's
 * internals — callers don't change.
 *
 * @param {string} text - the user's message
 * @returns {Promise<string>} - the assistant's reply text
 */
export async function sendMessage(text) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: text }]
  })

  return response.content[0].text
}
