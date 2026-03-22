# AI Guardrails

These rules exist because generated code drifts toward noise unless the repo pushes back.

## Required standard

- Keep files reviewable. Prefer extracting helpers before a file approaches 500 lines.
- Keep functions reviewable. Prefer extracting logic before a function approaches 90 lines or complexity 10.
- Treat the complexity/file-size gates as hard constraints while generating code, not cleanup work for later.
- Start extracting before the hard limits: if a changed TS/TSX function is likely to reach cyclomatic 8, cognitive 15, or 70 LOC, split logic into named helpers/components before adding more branches.
- Start splitting files before the hard limit: if a changed file is likely to exceed ~450 lines, move UI sections, helpers, or orchestration logic into focused modules.
- Do not assume `src/App.tsx` or other application TS/TSX files are generated; treat them as maintained source unless the file itself clearly says otherwise.
- No `any` unless there is a documented boundary reason.
- Prefer small, named helpers over nested conditionals.
- Prefer object parameters once a function grows beyond a few positional arguments.
- Do not add new lint disables unless the reason is written inline.
- Do not commit code that fails `npm run quality`.
- For partial work, at minimum make changed files pass `npm run quality:staged`.
- Changed TS functions should stay within the local guardrails: cyclomatic `<= 10`, cognitive `<= 20`, LOC `<= 90`.

## Expected workflow

1. For TS/TSX edits, check touched file size first; if a file is near 450 lines, extract before adding behavior.
2. Make the change.
3. Run `npm run quality:staged` while iterating.
4. If you touched branch-heavy TS/TSX, React render shells, coordinator/orchestration code, or added several boolean conditions, run `npm run complexity:staged` immediately, not just before commit.
5. Run `npm run quality` before handing over larger changes.
6. Use `npm run complexity:report -- --top 20 --min-cyclomatic 10` if code starts to sprawl.

## Fast loop defaults

- Default to the fastest safe path for local edits, bugfixes, refactors, and small behavior changes.
- If the user says `just do it` or `JDI`, treat that as an explicit instruction to skip superpowers/skill workflows and take the fastest safe execution path for the current request.
- The `just do it` / `JDI` shortcut applies only to small, low-risk work in this repository. Do not use it for architectural changes, large multi-step features, risky migrations, security-sensitive work, or anything that would normally need design clarification.
- Even in `just do it` / `JDI` mode, still follow the quality and verification expectations in this file, keep exploration tight, and ask a brief question if a risky ambiguity would otherwise force a guess.
- Do not require formal design docs or multi-step planning unless the user asks for them or the task is ambiguous, architectural, or spans multiple subsystems.
- Keep exploration tight: read the directly relevant files first instead of reloading broad repo context by default.
- During iteration, prefer targeted verification plus `npm run quality:staged`; reserve `npm run quality` for handoff, larger changes, or when config/runtime wiring changed.
- Treat a feature as one vertical slice even when it spans UI, boundary, services, and data; use separate worktrees only for independent tasks or interruptions.
- Do not recommend restarting the dev runtime unless the changed files or tooling indicate it is required. Use `npm run dev:impact` when needed.
- Assume the main workspace uses the default dev ports and worktrees use automatic stable offsets unless `VITE_PORT` or `VITE_BACKEND_PORT` explicitly override them.

## Windows Tool Usage

- On Windows, prefer direct executable invocation over shell wrappers whenever possible.
- Use exact tools when available: `rg.exe`, `git.exe`, `node.exe`, `npm.cmd`, `npx.cmd`, and `python.exe`.
- Use Git Bash only when shell syntax is actually required, such as pipes, redirects, globs, `&&`, `||`, or command substitution.
- Use PowerShell only for Windows-specific system operations such as services, registry, Defender, scheduled tasks, or event logs.
- Do not use `bash -lc` for simple tool invocations that can run directly.
- After the first tool-launch failure, stop retrying quoting variants and switch to a deterministic fallback.
- Keep tool-failure commentary concise: summarize the failure once, then state the fallback.

## Biases

- Favour explicit names over clever abstractions.
- Favour boring control flow over dense one-liners.
- If a component or module is getting large, split by responsibility instead of adding comments to excuse it.
- In React, keep the top-level component body mostly to state/hooks/wiring; move derived data and conditional UI fragments into helpers or child components before the render body becomes branch-heavy.
