# Fast Lint Coverage Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every repo rule that Oxlint can enforce safely today into the fast lint path, while leaving only the genuinely unsupported or type-aware rules in ESLint.

**Architecture:** Treat Oxlint as the primary JS/TS guardrail engine for both full and changed-file linting, and keep ESLint as a narrower gap-filler for typed TypeScript rules and any React rules Oxlint cannot yet replace without regressions. Add explicit parity tests so the fast-loop config cannot silently drift away from the main Oxlint config or the repo's reviewability guardrails.

**Tech Stack:** Node.js scripts, Oxlint, ESLint flat config, TypeScript, Node test runner, repo quality scripts

---

## Chunk 1: Stabilise the Fast-Loop Config Split

### Task 1: Add regression coverage for the fast-loop Oxlint path

**Files:**

- Modify: `C:\Users\robin\Projects\photoStar2\tooling\scripts\repo\lint-changed-files.mjs`
- Create: `C:\Users\robin\Projects\photoStar2\tests\repo\lint-config-parity.test.mjs`
- Test: `C:\Users\robin\Projects\photoStar2\tests\repo\lint-config-parity.test.mjs`

- [ ] **Step 1: Extract a testable helper for linter argument selection**

Move the Oxlint/ESLint argument construction in `lint-changed-files.mjs` behind a named export such as `buildLinterArgs({ tool, fix, files })` so the config path and tool invocation can be asserted without spawning child processes.

- [ ] **Step 2: Write a failing regression test for the changed-file Oxlint config**

Add a test that imports the helper and asserts that `tool: 'oxlint'` uses `.oxlintrc.fast-loop.json`, while `tool: 'eslint'` still uses the ESLint CLI args.

- [ ] **Step 3: Write a failing parity test for shared Oxlint settings**

Load `.oxlintrc.json` and `.oxlintrc.fast-loop.json` in the new repo test and assert that the following stay identical unless intentionally changed:

```js
[
  'categories',
  'plugins',
  'env',
  'ignorePatterns',
  'overrides',
]
```

- [ ] **Step 4: Implement the helper export and parity assertions**

Keep the script behavior unchanged, but make the fast-loop config choice and the intended shared config surface explicit in tests.

- [ ] **Step 5: Run the focused repo tests**

Run: `node --test tests/repo/lint-config-parity.test.mjs`

Expected: PASS

### Task 2: Align the fast-loop reviewability rules with the repo policy

**Files:**

- Modify: `C:\Users\robin\Projects\photoStar2\.oxlintrc.fast-loop.json`
- Modify: `C:\Users\robin\Projects\photoStar2\eslint.config.js`
- Test: `C:\Users\robin\Projects\photoStar2\tests\repo\lint-config-parity.test.mjs`

- [ ] **Step 1: Write a failing test for the intended reviewability delta**

Extend the parity test so it asserts the fast-loop-only additions are exactly the intentionally migrated rules and that their thresholds match the repo guardrails:

```js
{
  complexity: { max: 10 },
  'max-lines': { max: 500 },
  'max-lines-per-function': { max: 90 },
}
```

- [ ] **Step 2: Decide and encode the intentional semantic differences**

Before moving more rules, choose one of these paths and encode it in tests:

```text
Path A: Match ESLint semantics as closely as Oxlint allows.
Path B: Document that fast-loop reviewability is intentionally stricter.
```

- [ ] **Step 3: Update `.oxlintrc.fast-loop.json` to reflect the chosen policy**

If Oxlint supports the equivalent options, mirror the ESLint settings for skipped blank lines, skipped comments, and IIFE handling. If it does not, keep the stricter rule but make that difference explicit in the test name and failure message.

- [ ] **Step 4: Re-run the focused repo tests**

Run: `node --test tests/repo/lint-config-parity.test.mjs`

Expected: PASS

## Chunk 2: Move Safe ESLint Rules into Oxlint

### Task 3: Migrate non-type-aware repo rules from ESLint into Oxlint

**Files:**

- Modify: `C:\Users\robin\Projects\photoStar2\.oxlintrc.json`
- Modify: `C:\Users\robin\Projects\photoStar2\.oxlintrc.fast-loop.json`
- Modify: `C:\Users\robin\Projects\photoStar2\eslint.config.js`
- Test: `C:\Users\robin\Projects\photoStar2\tests\repo\lint-config-parity.test.mjs`

- [ ] **Step 1: Add the current easy-win TypeScript and React rules to `.oxlintrc.json`**

Start with rules that do not need full type-aware linting and already exist in the repo's ESLint config:

```text
typescript/no-explicit-any
typescript/consistent-type-imports
react/jsx-boolean-value
react/jsx-no-useless-fragment
react/rules-of-hooks
react/exhaustive-deps
react/only-export-components
```

- [ ] **Step 2: Mirror the same rules into `.oxlintrc.fast-loop.json`**

The fast-loop config should stay a superset of the main Oxlint rules, not a different policy universe.

- [ ] **Step 3: Remove only the migrated rules from `eslint.config.js`**

Keep ESLint responsible for the remaining gaps only. Do not remove rules from ESLint until the Oxlint equivalents are active and verified in both Oxlint config files.

- [ ] **Step 4: Add a repo test that locks the intentional ESLint remainder**

Update `lint-config-parity.test.mjs` so it asserts the remaining ESLint-only rules are exactly:

```text
@typescript-eslint/consistent-type-exports
@typescript-eslint/no-floating-promises
@typescript-eslint/no-misused-promises
@typescript-eslint/return-await
@typescript-eslint/switch-exhaustiveness-check
react-hooks/set-state-in-effect (off)
react/prop-types (off)
```

- [ ] **Step 5: Run changed-file quality on the touched files**

Run: `npm.cmd run quality:staged`

Expected: PASS

### Task 4: Keep the full quality gate honest while Oxlint coverage grows

**Files:**

- Modify: `C:\Users\robin\Projects\photoStar2\package.json`
- Modify: `C:\Users\robin\Projects\photoStar2\tests\repo\tooling-productivity.test.mjs`
- Test: `C:\Users\robin\Projects\photoStar2\tests\repo\tooling-productivity.test.mjs`

- [ ] **Step 1: Decide whether to expose an explicit "eslint:gaps" script**

If the team wants the narrower ESLint role to stay obvious, add scripts such as:

```json
{
  "lint:gaps": "eslint .",
  "lint:gaps:changed": "node tooling/scripts/repo/lint-changed-files.mjs --changed"
}
```

Only do this if it makes the workflow clearer; otherwise keep the current script names and document the split in tests.

- [ ] **Step 2: Add or update the productivity test to reflect the intended script contract**

Make the test assert the final `quality`, `quality:changed`, and any new gap-filler scripts so future refactors cannot silently widen ESLint again.

- [ ] **Step 3: Run the focused repo tooling tests**

Run: `node --test tests/repo/tooling-productivity.test.mjs tests/repo/lint-config-parity.test.mjs`

Expected: PASS

## Chunk 3: Leave the Unsupported Rules Deliberately

### Task 5: Document and retain the type-aware ESLint rules that Oxlint should not replace yet

**Files:**

- Modify: `C:\Users\robin\Projects\photoStar2\eslint.config.js`
- Modify: `C:\Users\robin\Projects\photoStar2\docs\superpowers\plans\2026-03-23-fast-lint-coverage-migration.md`
- Test: `C:\Users\robin\Projects\photoStar2\tests\repo\lint-config-parity.test.mjs`

- [ ] **Step 1: Keep the typed rule block grouped and commented**

Add a short comment in `eslint.config.js` above the remaining `@typescript-eslint` rules explaining that these stay in ESLint until Oxlint type-aware linting is viable for the repo's TypeScript/tooling stack.

- [ ] **Step 2: Keep the unsupported-rule list current in the repo test**

The parity test should fail if someone adds a new ESLint-only rule without making an explicit migration decision.

- [ ] **Step 3: Run full quality before handoff**

Run: `npm.cmd run quality`

Expected: PASS

### Task 6: Measure whether the migration improved the fast loop

**Files:**

- Modify: `C:\Users\robin\Projects\photoStar2\package.json` (only if a new benchmark script is needed)
- Modify: `C:\Users\robin\Projects\photoStar2\tooling\scripts\repo\benchmark-quality.js` (only if the current benchmark output is insufficient)

- [ ] **Step 1: Capture a before/after benchmark using the existing tooling**

Run: `npm.cmd run benchmark:quality`

Record the timings for:

```text
npm run quality:changed
npm run quality
```

- [ ] **Step 2: Sanity-check the outcome**

The migration is only worth keeping if:

```text
quality:changed stays meaningfully faster than full quality
the migrated rules are enforced in fast lint
full quality still catches the typed rules that remain in ESLint
```

- [ ] **Step 3: Commit the lint migration slice**

Run:

```bash
git add .oxlintrc.json .oxlintrc.fast-loop.json eslint.config.js package.json tooling/scripts/repo/lint-changed-files.mjs tests/repo/lint-config-parity.test.mjs tests/repo/tooling-productivity.test.mjs docs/superpowers/plans/2026-03-23-fast-lint-coverage-migration.md
git commit -m "refactor: move safe lint rules into fast oxlint path"
```
