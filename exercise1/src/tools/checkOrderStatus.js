/**
 * Tool definition for Claude's `tools` parameter (Anthropic Messages API).
 *
 * This describes WHAT the tool does and WHEN to use it — the `description`
 * field is not documentation for humans, it's the primary signal Claude
 * uses to decide whether to call this tool at all, and to distinguish it
 * from other similarly named tools (e.g. checkAccountBalance).
 */
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
