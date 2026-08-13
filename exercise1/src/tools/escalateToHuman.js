/**
 * Tool definition for Claude's `tools` parameter (Anthropic Messages API).
 *
 * The fallback/escalation tool referenced in the project's escalation
 * logic goal. This is deliberately the only tool with no domain-specific
 * boundary condition to defend — its description instead focuses on WHEN
 * (as a last resort, not a first move) rather than differentiating it from
 * a sibling tool.
 */
export const escalateToHumanTool = {
  name: 'escalate_to_human',
  description:
    'Hand off the conversation to a human support agent. Use this only after other available ' +
    'tools have been tried and did not resolve the issue, or when the request is something no ' +
    'tool can address (e.g. a complaint, a request explicitly asking for a human, a security or ' +
    'fraud concern, or a situation requiring judgment beyond looking up a record). Do not use this ' +
    'as a first response — attempt to resolve the request with search_help_articles, ' +
    'check_order_status, or check_account_balance first, unless the user explicitly asks to speak ' +
    'with a person.',
  input_schema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        enum: ['unresolved', 'customer_request', 'tool_failure', 'sensitive'],
        description:
          "Why escalation is needed: 'unresolved' (tools didn't solve it), 'customer_request' " +
          "(user asked for a human), 'tool_failure' (a tool errored and couldn't be retried), " +
          "'sensitive' (fraud, security, or complaint requiring human judgment)."
      },
      summary: {
        type: 'string',
        description: "A brief summary of the conversation so far, for the human agent's context."
      }
    },
    required: ['reason', 'summary']
  }
}
