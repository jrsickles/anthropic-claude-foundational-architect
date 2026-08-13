import { checkOrderStatusTool } from './checkOrderStatus.js'
import { checkAccountBalanceTool } from './checkAccountBalance.js'
import { searchHelpArticlesTool } from './searchHelpArticles.js'
import { escalateToHumanTool } from './escalateToHuman.js'

// Registry of every tool definition available to the agent.
// This is the array you pass directly into client.messages.create({ tools }).
// As more tool files are added, import and append them here — callers
// (sendMessage.js, the agent loop, etc.) only ever import from this one
// file and never need to know which individual tool files exist.
export const tools = [
  checkOrderStatusTool,
  checkAccountBalanceTool,
  searchHelpArticlesTool,
  escalateToHumanTool
]
