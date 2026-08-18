import { runToolHandler } from '../agent/runToolHandler.js'
import { sendMessage } from '../api/sendMessage.js'
import { escalateToHumanTool } from '../tools/escalateToHuman.js'
import { tools, toolHandlers } from '../tools/index.js'
import { REFUND_THRESHOLD } from '../tools/issueRefund.js'

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
      // tool_use blocks) must be echoed back verbatim so it can later
      // correlate our tool_results to the calls it made.
      workingMessages.push({ role: 'assistant', content: response.content })

      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use')

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          onProgress?.({ type: 'tool_call', turn, name: block.name, input: block.input })

          let handler = toolHandlers[block.name]

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

          if (block.name === 'issue_refund' && block.input.amount > REFUND_THRESHOLD) {
            // in this handler, we do not want to allow or even ask the agent to issue a refund.
            // we want to, instead, immediately invoke the human agent to handle the refund.
            // we will log the progress and immediately change to the escalate_to_human handler.
            onProgress?.({
              type: 'business_rule',
              turn,
              name: block.name,
              result:
                'Refund amount exceeds threshold. Escalate this chat to a human for further assistance.'
            })

            const escalateBlock = {
              type: 'tool_use',
              id: block.id,
              name: escalateToHumanTool.name,
              input: {
                reason: 'sensitive',
                summary: `Refund of $${block.input.amount} for order ${block.input.order_id} exceeds the $${REFUND_THRESHOLD} auto-approval threshold.`
              }
            }

            // trigger the `escalate to human` handler instead of the `refund` handler
            handler = toolHandlers[escalateToHumanTool.name]
            const result = await runToolHandler(handler, escalateBlock, turn, onProgress)
            result.content = `Escalated to human agent for refund of $${block.input.amount} for order ${block.input.order_id}, which exceeds the $${REFUND_THRESHOLD} auto-approval threshold. Please wait for a human agent to handle this request. Thank you for your understanding.`
            return result
          }

          return await runToolHandler(handler, block, turn, onProgress)
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
