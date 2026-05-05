# Updates Log

## [0.1.74] - 2026-05-05T07:46:00Z

- Added several auto-fixable linting rules (`unicorn/prefer-global-this`, `prefer-template`, `react/jsx-curly-brace-presence`, etc.) to `.oxlintrc.json` and `eslint.config.js`.
- Ran global autofix pass across the repository.

## [0.1.73] - 2026-05-05T01:46:00Z

- Extracted `ManualPathPrompt` into its own component in `src/ui/components/ActionPanel.tsx` to resolve ESLint cyclomatic complexity and max lines limits.
