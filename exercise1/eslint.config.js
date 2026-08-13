import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from '@vue/eslint-config-prettier'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // Allow single-word component names (e.g. ChatInterface is fine,
      // but this also permits things like `App.vue`)
      'vue/multi-word-component-names': 'off',
      // Catch unused vars/imports, but allow leading-underscore intentional unused args
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**']
  }
]
