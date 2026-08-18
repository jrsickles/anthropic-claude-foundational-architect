import { ref, computed } from 'vue'
import { runAgentLoop } from '../agent/runAgentLoop.js'

/**
 * Owns the entire chat state and the logic to advance a conversation.
 *
 * This is a Vue composable: a plain function that uses ref()/computed()
 * internally and returns the reactive pieces a component needs. Unlike a
 * component, it has no template of its own — it can be called from any
 * component (or from a test) to get an independent, reactive chat session.
 */
export function useChat() {
  const userInput = ref('')
  const lastResponse = ref([])
  const messages = ref([])
  const status = ref('idle') // idle | loading | success | error
  const error = ref(null)
  const payload = ref([])

  async function submit() {
    const text = userInput.value.trim()
    if (!text) return

    status.value = 'loading'
    error.value = null
    lastResponse.value = []

    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'pending',
      response: null
    }
    messages.value.push(userMsg)
    userInput.value = ''

    try {
      payload.value = messages.value
        .filter(({ status }) => status !== 'failed')
        .map(({ role, content }) => ({ role, content }))
      const result = await runAgentLoop(payload.value, { onProgress: appendLastResponse })

      const assistantMsg = {
        role: 'assistant',
        content: result.text,
        timestamp: new Date().toISOString(),
        status: 'received',
        response: null
      }

      messages.value.push(assistantMsg)
      lastResponse.value.push(result.text)

      // update as successful
      status.value = 'success'
      userMsg.status = 'sent'
    } catch (e) {
      error.value = {
        status: e.status,
        type: e.error?.error?.type,
        message: e.error?.error?.message || e.message
      }
      // update as error/failed and add the specific error message
      status.value = 'error'
      userMsg.response = e.error
      userMsg.status = 'failed'
    }
  }

  function clearChat() {
    userInput.value = ''
    lastResponse.value = []
    messages.value = []
    status.value = 'idle'
    error.value = null
    payload.value = []
  }

  /**
   *
   * @param input
   */
  function appendLastResponse(input) {
    switch (input.type) {
      case 'business_rule':
        lastResponse.value.push(`Business Rule: ${input.result}.`)
        break
      case 'max_turns_exceeded':
        lastResponse.value.push(`Max turns exceeded after ${input.turn} turns.`)
        break
      case 'thinking':
        lastResponse.value.push(`Thinking about turn ${input.turn}...`)
        break
      case 'tool_call':
        lastResponse.value.push(`Tool call: ${input.name}(${JSON.stringify(input.input)})`)
        break
      case 'tool_result':
        lastResponse.value.push(`Tool result: ${input.name}(${JSON.stringify(input.result)})`)
        break
      case 'tool_error':
        lastResponse.value.push(`Tool error: ${input.name}(${input.error})`)
        break
    }
  }

  const payloadJson = computed(() => {
    return JSON.stringify(payload.value, null, 2)
  })

  const responseString = computed(() => {
    return lastResponse.value.join('\n\n')
  })

  const stateJson = computed(() => {
    return JSON.stringify(
      {
        status: status.value,
        error: error.value,
        messageCount: messages.value.length,
        messages: messages.value
      },
      null,
      2
    )
  })

  return {
    userInput,
    messages,
    status,
    error,
    payloadJson,
    responseString,
    stateJson,
    submit,
    clearChat
  }
}
