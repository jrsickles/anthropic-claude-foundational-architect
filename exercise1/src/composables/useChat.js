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
  const payload = ref([])

  async function submit() {
    const text = userInput.value.trim()
    if (!text) return

    status.value = 'loading'
    error.value = null

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
      const reply = await sendMessage(payload.value)

      const assistantMsg = {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
        status: 'sent',
        response: null
      }

      messages.value.push(assistantMsg)
      lastResponse.value = reply
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
    lastResponse.value = ''
    messages.value = []
    status.value = 'idle'
    error.value = null
    payload.value = []
  }

  const payloadJson = computed(() => {
    return JSON.stringify(payload.value, null, 2)
  })

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
    payloadJson,
    stateJson,
    submit,
    clearChat
  }
}
