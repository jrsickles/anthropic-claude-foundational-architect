export const REFUND_THRESHOLD = 10
/**
 * Tool definition for Claude's `tools` parameter (Anthropic Messages API).
 *
 * A tool that provides an automatic refund for a specific order.
 */
export function issueRefundHandler(input) {
  return `Refund of $${input.amount} issued for order ${input.order_id}.`
}

/** @type {import('@anthropic-ai/sdk').Anthropic.Tool} */
export const issueRefundTool = {
  name: 'issue_refund',
  description:
    'Issue a monetary refund to the customer for a specific order. This is a state-changing ' +
    'action, not a lookup — it actually processes a refund, unlike check_order_status which only ' +
    'reports information. Use this ONLY when the user has explicitly requested a refund and has ' +
    'confirmed both the order ID and the refund amount. Do not guess or estimate the amount — ask ' +
    'the user to confirm the exact dollar amount before calling this tool. Do NOT use this tool to ' +
    "simply check an order's status or eligibility for refund — use check_order_status for that " +
    'first if the user has not already confirmed the order is eligible.',
  input_schema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'The amount of the refund, e.g. 10.99.'
      },
      order_id: {
        type: 'string',
        description: "The customer's order ID, e.g. 'ORD-77410'."
      }
    },
    required: ['amount', 'order_id']
  }
}
