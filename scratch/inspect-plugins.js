import sonarjs from 'eslint-plugin-sonarjs'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import deslint from '@deslint/eslint-plugin'

console.log('sonarjs.configs.recommended keys:', Object.keys(sonarjs.configs.recommended || {}))
console.log('jsxA11y.flatConfigs.recommended keys:', Object.keys(jsxA11y.flatConfigs || {}))
if (jsxA11y.flatConfigs) {
  console.log('jsxA11y.flatConfigs.recommended structure:', Object.keys(jsxA11y.flatConfigs.recommended || {}))
}
console.log('deslint.configs.recommended keys:', Object.keys(deslint.configs || {}))
if (deslint.configs) {
  console.log('deslint.configs.recommended structure:', Object.keys(deslint.configs.recommended || {}))
}
process.exit(0)
