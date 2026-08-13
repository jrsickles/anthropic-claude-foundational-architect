import { checkAccountBalanceHandler, checkAccountBalanceTool } from './checkAccountBalance.js'
import { checkOrderStatusHandler, checkOrderStatusTool } from './checkOrderStatus.js'
import { escalateToHumanHandler, escalateToHumanTool } from './escalateToHuman.js'
import { searchHelpArticlesHandler, searchHelpArticlesTool } from './searchHelpArticles.js'

export const toolHandlers = {
  [checkAccountBalanceTool.name]: checkAccountBalanceHandler,
  [checkOrderStatusTool.name]: checkOrderStatusHandler,
  [escalateToHumanTool.name]: escalateToHumanHandler,
  [searchHelpArticlesTool.name]: searchHelpArticlesHandler
}

// Registry of every tool definition available to the agent.
// This is the array you pass directly into client.messages.create({ tools }).
// As more tool files are added, import and append them here — callers
// (sendMessage.js, the agent loop, etc.) only ever import from this one
// file and never need to know which individual tool files exist.
export const tools = [
  checkAccountBalanceTool,
  checkOrderStatusTool,
  escalateToHumanTool,
  searchHelpArticlesTool
]
