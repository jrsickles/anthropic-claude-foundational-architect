import { ToolError } from '../tools/toolError.js'

/**
 * runs a tool handler and returns the shaped result. handles the progress tracking via the given onProgress callback.
 * @param handlerMethod
 * @param block
 * @param turn
 * @param onProgress
 * @returns {Promise<{type: string, tool_use_id: *, content: string, is_error: boolean}>}
 */
export async function runToolHandler(handlerMethod, block, turn, onProgress) {
  try {
    const result = await handlerMethod(block.input)
    onProgress?.({ type: 'tool_result', turn, name: block.name, result })
    return formatToolResultResponse(
      block.id,
      typeof result === 'string' ? result : JSON.stringify(result)
    )
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
      return formatToolResultResponse(
        block.id,
        JSON.stringify({
          error: true,
          errorCategory: e.errorCategory,
          isRetryable: e.isRetryable,
          message
        }),
        true
      )
    }

    // Not a ToolError — an unexpected failure (a bug in the handler,
    // a thrown value that isn't an Error, etc). Claude still needs
    // to know it failed, but we have no category/retryability info
    // to give it, so this falls back to a flat message.
    onProgress?.({ type: 'tool_error', turn, name: block.name, error: message })
    return formatToolResultResponse(block.id, message, true)
  }
}

/**
 * Shapes the response Claude expects for a tool_result block.
 * @param toolUseId
 * @param content
 * @param isError
 * @returns {{type: string, tool_use_id: *, content: string, is_error: boolean}}
 */
export function formatToolResultResponse(toolUseId, content = '', isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: content,
    is_error: isError
  }
}
