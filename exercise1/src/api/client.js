import Anthropic from '@anthropic-ai/sdk'

// Single shared SDK client instance for the whole app.
// dangerouslyAllowBrowser is required because this project has no backend —
// the API key ships in the client bundle. Fine for local exam/practice use,
// not something you'd do in a real production app.
export const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true
})
