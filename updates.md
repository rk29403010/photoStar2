# Updates Log

## [0.1.75] - 2026-05-05T08:15:00Z

- Configured ESLint and Oxlint with `react/prefer-read-only-props`, `@typescript-eslint/consistent-type-definitions: type`, `unicorn/no-typeof-undefined` and `@typescript-eslint/no-deprecated`.
- Ran a global auto-fix pass to convert `interface` to `type` and make component props `readonly` across the codebase.
- Replaced usages of the deprecated `MutableRefObject` API with `RefObject`.
- Fixed `Timeout` vs `number` TypeScript errors caused by the previous `globalThis` auto-fix by typing refs with `ReturnType<typeof setTimeout> | null`.

## [0.1.74] - 2026-05-05T07:46:00Z

- Added several auto-fixable linting rules (`unicorn/prefer-global-this`, `prefer-template`, `react/jsx-curly-brace-presence`, etc.) to `.oxlintrc.json` and `eslint.config.js`.
- Ran global autofix pass across the repository.

## [0.1.73] - 2026-05-05T01:46:00Z

- Extracted `ManualPathPrompt` into its own component in `src/ui/components/ActionPanel.tsx` to resolve ESLint cyclomatic complexity and max lines limits.
