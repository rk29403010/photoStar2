# AI Guardrails

These rules exist because generated code drifts toward noise unless the repo pushes back.

## Required standard

- Keep files reviewable. Prefer extracting helpers before a file approaches 500 lines.
- Keep functions reviewable. Prefer extracting logic before a function approaches 90 lines or complexity 10.
- No `any` unless there is a documented boundary reason.
- Prefer small, named helpers over nested conditionals.
- Prefer object parameters once a function grows beyond a few positional arguments.
- Do not add new lint disables unless the reason is written inline.
- Do not commit code that fails `npm run quality`.
- For partial work, at minimum make changed files pass `npm run quality:staged`.
- Changed TS functions should stay within the local guardrails: cyclomatic `<= 10`, cognitive `<= 20`, LOC `<= 90`.

## Expected workflow

1. Make the change.
2. Run `npm run quality:staged` while iterating.
3. Run `npm run quality` before handing over larger changes.
4. Run `npm run complexity:staged` before commit if you touched heavier TS logic.
5. Use `npm run complexity:report -- --top 20 --min-cyclomatic 10` if code starts to sprawl.

## Biases

- Favour explicit names over clever abstractions.
- Favour boring control flow over dense one-liners.
- If a component or module is getting large, split by responsibility instead of adding comments to excuse it.
