/**
 * Tool definition for Claude's `tools` parameter (Anthropic Messages API).
 *
 * The "general knowledge, no customer data" tool — contrasts with
 * checkOrderStatus and checkAccountBalance, which both require a specific
 * ID tied to one customer's private record. This distinction (general vs.
 * account-specific) is its own disambiguation axis worth calling out
 * explicitly in the description.
 */

export function searchHelpArticlesHandler(input) {
  // todo: mock the results
  return 'https://support.example.com/search?q=' + input.query
}

/** @type {import('@anthropic-ai/sdk').Anthropic.Tool} */
export const searchHelpArticlesTool = {
  name: 'search_help_articles',
  description:
    'Search the general knowledge base for troubleshooting guides, FAQs, and how-to articles ' +
    '(e.g. "how do I reset my password", "why is my order tracking not updating"). This returns ' +
    "general informational content only — it has no access to any individual customer's order, " +
    'account, or billing data. If the user is asking about the status of their own specific order ' +
    'or account, use check_order_status or check_account_balance instead, not this tool.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "The user's question or search terms, e.g. 'reset password'."
      }
    },
    required: ['query']
  }
}
