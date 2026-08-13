/**
 * Tool definition for Claude's `tools` parameter (Anthropic Messages API).
 *
 * Deliberately mirrors checkOrderStatus's "single ID lookup" shape — these
 * two tools are the intentional disambiguation pair. Both accept a single
 * ID and return status info, so the description text does most of the work
 * of steering Claude to the correct one when a user's message is ambiguous
 * (e.g. "what's going on with my account?").
 */
export function checkAccountBalanceHandler(input) {
  // todo: mock the results
  return 'account balance: $100'
}

/** @type {import('@anthropic-ai/sdk').Anthropic.Tool} */
export const checkAccountBalanceTool = {
  name: 'check_account_balance',
  description:
    'Look up the current billing balance, payment status, and next due date for a customer ' +
    'account (e.g. amount owed, last payment received, autopay status). Use this ONLY for ' +
    'billing, payment, invoice, refund, or balance questions. Requires a specific account ID — ' +
    'do not use this tool if the user has not provided one; ask them for it first. Do NOT use ' +
    'this tool for questions about where a physical order is or when it will arrive — use ' +
    'check_order_status for those instead, even if the user also mentions their account in the ' +
    'same message.',
  input_schema: {
    type: 'object',
    properties: {
      account_id: {
        type: 'string',
        description: "The customer's account ID, e.g. 'ACC-77410'."
      }
    },
    required: ['account_id']
  }
}
