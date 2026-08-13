import { ref, computed } from 'vue'
import { sendMessage } from '../api/sendMessage.js'

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
  const lastResponse = ref('')
  const messages = ref([])
  const status = ref('idle') // idle | loading | success | error
  const error = ref(null)

  async function submit() {
    const text = userInput.value.trim()
    if (!text) return

    status.value = 'loading'
    error.value = null

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() }
    messages.value.push(userMsg)
    userInput.value = ''

    try {
      const reply = await sendMessage(
          messages.value.map(({ role, content }) => ({ role, content }))
      )

      const assistantMsg = { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
      messages.value.push(assistantMsg)
      lastResponse.value = reply
      status.value = 'success'
    } catch (e) {
      error.value = e.message || 'Unknown error'
      status.value = 'error'
    }
  }

  function clearChat() {
    userInput.value = ''
    lastResponse.value = ''
    messages.value = []
    status.value = 'idle'
    error.value = null
  }

  const stateJson = computed(() => {
    return JSON.stringify(
      {
        status: status.value,
        error: error.value,
        messageCount: messages.value.length,
        messages: messages.value,
        lastResponse: lastResponse.value
      },
      null,
      2
    )
  })

  return {
    userInput,
    lastResponse,
    messages,
    status,
    error,
    stateJson,
    submit,
    clearChat
  }
}
