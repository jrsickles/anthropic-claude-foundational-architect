/**
 * Tool definition for Claude's `tools` parameter (Anthropic Messages API).
 *
 * This describes WHAT the tool does and WHEN to use it — the `description`
 * field is not documentation for humans, it's the primary signal Claude
 * uses to decide whether to call this tool at all, and to distinguish it
 * from other similarly named tools (e.g. checkAccountBalance).
 */

import { ToolError } from './toolError.js'

/**
 * Mock handler. Real order lookups aren't implemented — this exists to
 * exercise the tool-calling loop and structured error handling.
 *
 * Sentinel order_id values trigger each error category on purpose, so the
 * agent's retry/explain/escalate behavior can be tested end to end without
 * a real backend:
 *   'FAIL-TRANSIENT'  -> simulates a flaky downstream service (retryable)
 *   'FAIL-VALIDATION' -> simulates a bad/unrecognized order ID (not retryable)
 *   'FAIL-PERMISSION' -> simulates an order outside this account's access (not retryable)
 */
export function checkOrderStatusHandler(input) {
  if (input.order_id === 'FAIL-TRANSIENT') {
    throw new ToolError('The order lookup service timed out. Please try again.', {
      errorCategory: 'transient',
      isRetryable: true
    })
  }

  if (input.order_id === 'FAIL-VALIDATION') {
    throw new ToolError(`No order found with ID "${input.order_id}".`, {
      errorCategory: 'validation',
      isRetryable: false
    })
  }

  if (input.order_id === 'FAIL-PERMISSION') {
    throw new ToolError('You do not have permission to view this order.', {
      errorCategory: 'permission',
      isRetryable: false
    })
  }

  // todo: mock realistic results per order_id
  return 'Due to be delivered on Thursday.'
}

/** @type {import('@anthropic-ai/sdk').Anthropic.Tool} */
export const checkOrderStatusTool = {
  name: 'check_order_status',
  description:
    'Look up the shipping and fulfillment status of a single customer order (e.g. processing, ' +
    'shipped, out for delivery, delivered, delayed). Use this ONLY when the user is asking about ' +
    'where a physical order is or when it will arrive. Requires a specific order ID — do not use ' +
    'this tool if the user has not provided one; ask them for it first. Do NOT use this tool for ' +
    'billing, payment, refund, or account balance questions — use check_account_balance for those ' +
    'instead, even if the user also mentions an order in the same message.',
  input_schema: {
    type: 'object',
    properties: {
      order_id: {
        type: 'string',
        description: "The customer's order ID, e.g. 'ORD-48213'."
      }
    },
    required: ['order_id']
  }
}
