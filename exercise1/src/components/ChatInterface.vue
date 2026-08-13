<script setup>
import { useChat } from '../composables/useChat.js'

const {userInput, lastResponse, stateJson, submit, clearChat} = useChat()
</script>

<template>
  <div class="chat-interface">
    <div>
      <h1>Chat State Demo</h1>
      <div class="subtitle">No backend — state lives in Vue only.</div>
    </div>

    <div>
      <label for="userInput">Message</label>
      <textarea id="userInput" v-model="userInput" placeholder="Type a message..."></textarea>
    </div>

    <div class="buttons">
      <button class="submit" @click="submit" :disabled="!userInput.trim()">Submit</button>
      <button class="clear" @click="clearChat">Clear</button>
    </div>

    <div>
      <label for="response">Response</label>
      <p id="response" class="response-box">{{ lastResponse || '—' }}</p>
    </div>

    <div>
      <label for="stateBlock">Chat State (JSON)</label>
      <pre id="stateBlock"><code>{{ stateJson }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.chat-interface {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #e0e0e0;
}

h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}

.subtitle {
  font-size: 12px;
  color: #888;
}

label {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #999;
  margin-bottom: 6px;
}

textarea,
.response-box {
  width: 100%;
  background: #2a2a2a;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

textarea#userInput {
  min-height: 90px;
}

.response-box {
  min-height: 90px;
  white-space: pre-wrap;
  margin: 0;
}

.buttons {
  display: flex;
  gap: 10px;
}

button {
  padding: 8px 18px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
}

button.submit {
  background: #4f8cff;
  color: white;
}

button.submit:disabled {
  background: #33507a;
  cursor: not-allowed;
}

button.clear {
  background: #444;
  color: #e0e0e0;
}

pre#stateBlock {
  background: #111;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 12px;
  font-size: 12.5px;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}
</style>
