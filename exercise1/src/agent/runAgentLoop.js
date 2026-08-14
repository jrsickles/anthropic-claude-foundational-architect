import { sendMessage } from '../api/sendMessage.js'
import { tools, toolHandlers } from '../tools/index.js'
import { ToolError } from '../tools/toolError.js'

// Hard cap on how many times we'll go back to Claude within a single
// runAgentLoop() call. This is the escalation trigger for "the agent seems
// stuck" — without it, a model that keeps calling tools without ever
// reaching end_turn would loop forever.
const MAX_TURNS = 5

/**
 * Drives the full tool-use round trip for one user submission: sends the
 * conversation to Claude, and if Claude responds with stop_reason
 * "tool_use", runs the requested tool(s) locally and sends the results
 * back — repeating until Claude produces a final text answer, the turn
 * cap is hit, or something unrecoverable happens.
 *
 * Framework-agnostic on purpose: takes and returns plain arrays/objects,
 * no Vue refs. useChat.js is responsible for syncing whatever this
 * returns, back into its reactive state.
 *
 * @param {Array<Object>} messages - conversation history so far (plain objects, not a ref)
 * @param {Object} [options]
 * @param {(event: Object) => void} [options.onProgress] - called with status updates as the loop advances
 * @returns {Promise<{ text: string, messages: Array<Object>, turns: number }>}
 */
export async function runAgentLoop(messages, { onProgress } = {}) {
  // Work on a copy so callers control when/whether their own array is
  // reassigned — this function never mutates the array it was handed.
  const workingMessages = [...messages]

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    onProgress?.({ type: 'thinking', turn })

    const response = await sendMessage(workingMessages, tools)

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((block) => block.type === 'text')

      workingMessages.push({ role: 'assistant', content: response.content })

      return {
        text: textBlock?.text ?? '',
        messages: workingMessages,
        turns: turn
      }
    } else if (response.stop_reason === 'tool_use') {
      // Claude wants to call one or more tools. Its turn (including the
      // tool_use block(s)) must be echoed back verbatim so it can later
      // correlate our tool_result(s) to the call(s) it made.
      workingMessages.push({
        role: 'assistant',
        content: response.content
        // todo do we add timestamp and other things here, or in the calling function?
      })

      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use')

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          onProgress?.({ type: 'tool_call', turn, name: block.name, input: block.input })

          const handler = toolHandlers[block.name]

          if (!handler) {
            onProgress?.({
              type: 'tool_error',
              turn,
              name: block.name,
              error: 'no handler registered'
            })
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: `No handler is registered for tool "${block.name}".`,
              is_error: true
            }
          }

          try {
            const result = await handler(block.input)
            onProgress?.({ type: 'tool_result', turn, name: block.name, result })
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: typeof result === 'string' ? result : JSON.stringify(result)
            }
          } catch (e) {
            const message = e?.message || 'Unknown tool error'

            if (e instanceof ToolError) {
              onProgress?.({
                type: 'tool_error',
                turn,
                name: block.name,
                error: message,
                errorCategory: e.errorCategory,
                isRetryable: e.isRetryable
              })
              return {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({
                  error: true,
                  errorCategory: e.errorCategory,
                  isRetryable: e.isRetryable,
                  message
                }),
                is_error: true
              }
            }

            // Not a ToolError — an unexpected failure (a bug in the handler,
            // a thrown value that isn't an Error, etc). Claude still needs
            // to know it failed, but we have no category/retryability info
            // to give it, so this falls back to a flat message.
            onProgress?.({ type: 'tool_error', turn, name: block.name, error: message })
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: message,
              is_error: true
            }
          }
        })
      )

      workingMessages.push({ role: 'user', content: toolResults })
    } else {
      // todo handle other stop_reasons
    }
  }

  // Turn cap reached without Claude reaching a final answer — this is
  // the point where a real implementation would hand off to
  // escalate_to_human rather than silently giving up.
  onProgress?.({ type: 'max_turns_exceeded', turn: MAX_TURNS })

  return {
    text: "I wasn't able to resolve this after several attempts. Escalating to a human agent.",
    messages: workingMessages,
    turns: MAX_TURNS
  }
}
