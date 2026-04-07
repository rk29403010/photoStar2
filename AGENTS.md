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
4. Treat `npm run lint:fast:staged` as the fast guardrail for cyclomatic complexity plus file and function LOC, because `oxlint` now enforces `complexity`, `max-lines`, and `max-lines-per-function`.
5. If you touched branch-heavy TS/TSX, React render shells, coordinator/orchestration code, or added several boolean conditions, run `npm run complexity:staged` immediately, not just before commit. This remains the cognitive-complexity backstop.
6. If the index is noisy or contains unrelated staged files, run the changed-file scripts with explicit ownership lists instead of broad staged mode, for example `npm run complexity:staged -- --files=src/foo.ts,src/bar.tsx`.
7. Before editing application code while a managed dev session is running, pause it with `npm run dev:pause`; once edits and immediate verification are complete, resume it with `npm run dev:resume`.
8. Run `npm run quality` before handing over larger changes.
9. Use `npm run complexity:report -- --top 20 --min-cyclomatic 10` if code starts to sprawl.

## Git ownership and commit protocol

- The AI owns Git hygiene for the files it creates, edits, deletes, stages, or commits. Do not rely on the user to infer which files belong to a task.
- Before any commit, inspect `git status --short` and identify whether the repo already contains unrelated staged or unstaged changes.
- If unrelated changes exist, say so explicitly and stage only the files relevant to the current task. Do not silently sweep unrelated changes into a commit.
- If the user asks to commit a task, the default expectation is that the AI stages all relevant files for that task before committing.
- Do not leave partial staging behind unless the user explicitly asked for it. Avoid mixed index/working-tree states like `MM` when finishing a task.
- Before committing, show or summarize `git diff --cached --stat` so the staged contents are explicit.
- After committing, inspect `git status --short` again and report any remaining staged or unstaged files. If leftovers remain, say whether they are unrelated pre-existing changes or follow-up work from the current task.
- A task is not "finished" if its relevant files were edited but not staged, staged but not committed, or left partially staged without explanation.

## Parallel Thread Protocol

- Treat each chat thread as one task capsule: one worktree, one branch, one goal.
- Use the shared thread tracker for worktree bookkeeping instead of relying on stash names or memory. The tracker is shared across linked worktrees through Git's common directory.
- For every new chat conversation or explicit thread split, create a dedicated worktree first with `npm run thread:new -- --task "<task name>"` unless the user explicitly asks to stay on `main`.
- Treat follow-up requests inside the same chat conversation as work on that same worktree unless the user explicitly asks to branch off into a new thread.
- When starting an independent task in its own worktree, register it early with `npm run thread:register -- --task "<task name>"`.
- Treat `thread:register` as bookkeeping for an already-existing worktree. It does not create isolation on its own.
- If a thread needs its own managed app session, prefer `npm run thread:start-dev` so the tracker records the current dev script and worktree URL in one step.
- When a thread changes state, update it immediately with `npm run thread:update -- --status <active|blocked|ready-to-merge|parked>`.
- When a thread is finished, explicitly close it with `npm run thread:close -- --status <merged|parked|discarded>`.
- Before handing off, merging, or telling the user "what is active", inspect the tracker with `npm run thread:list` and confirm the current worktree with `npm run thread:status`.
- Do not treat `git stash` as normal task storage. Stash is emergency-only parking. If work matters, commit it on the task branch or close the thread as `parked` with a WIP commit.
- Do not leave a dirty worktree unregistered. If a worktree is active enough to edit, it is active enough to appear in the tracker.
- If the user asks in plain English to finish a thread, interpret it as a state transition plus the required Git action:
  - `ship it` means finish the thread cleanly, commit what belongs to it, merge it into `main`, push to GitHub, then `thread:close -- --status merged`.
  - `finish this thread and merge it back` means get the worktree clean, merge it, then `thread:close -- --status merged`.
  - `finish this thread, commit it, and keep the branch` means commit the work, leave the branch intact, then `thread:update -- --status ready-to-merge`.
  - `make a WIP commit and park this thread` means create a WIP commit, stop any managed dev session owned by that worktree if appropriate, then `thread:close -- --status parked`.
  - `discard this thread` means verify with the user before destructive cleanup, then `thread:close -- --status discarded`.
- When a managed dev session is part of the thread context, include that note in tracker updates via `--note` so the next thread can see what was running.

## Fast loop defaults

- Default to the fastest safe path for local edits, bugfixes, refactors, and small behavior changes.
- If the user says `just do it` or `JDI`, treat that as an explicit instruction to skip superpowers/skill workflows and take the fastest safe execution path for the current request.
- The `just do it` / `JDI` shortcut applies only to small, low-risk work in this repository. Do not use it for architectural changes, large multi-step features, risky migrations, security-sensitive work, or anything that would normally need design clarification.
- Even in `just do it` / `JDI` mode, still follow the quality and verification expectations in this file, keep exploration tight, and ask a brief question if a risky ambiguity would otherwise force a guess.
- Do not require formal design docs or multi-step planning unless the user asks for them or the task is ambiguous, architectural, or spans multiple subsystems.
- Keep exploration tight: read the directly relevant files first instead of reloading broad repo context by default.
- During iteration, prefer targeted verification plus `npm run quality:staged`; reserve `npm run quality` for handoff, larger changes, or when config/runtime wiring changed.
- For code edits, prefer pausing managed watcher sessions during the patch to reduce noisy rebuilds and resume them immediately after the edit/verification cycle.
- Treat a feature as one vertical slice even when it spans UI, boundary, services, and data; use separate worktrees only for independent tasks or interruptions.
- Do not recommend restarting the dev runtime unless the changed files or tooling indicate it is required. Use `npm run dev:impact` when needed.
- Assume the main workspace uses the default dev ports and worktrees use automatic stable offsets unless `VITE_PORT` or `VITE_BACKEND_PORT` explicitly override them.

## Windows Tool Usage

- On Windows, prefer direct executable invocation over shell wrappers whenever possible.
- Use exact tools when available: `rg.exe`, `git.exe`, `node.exe`, `npm.cmd`, `npx.cmd`, and `python.exe`.
- Do not launch repo dev scripts such as `npm run dev:core`, `npm run dev:web:desktop`, or `npm run dev:desktop-runtime` in detached visible terminal windows unless the user explicitly asks for that behavior.
- If a task requires starting a long-lived local process, say so clearly in commentary, prefer non-detached execution, and shut it down before handoff unless the user asked to keep it running.
- During cleanup, treat existing repo `dev:*` sessions as user-owned unless the AI started them in the current task or the user explicitly asked for them to be stopped.
- When using Playwright MCP on Windows, do not leave orphaned `cmd.exe` or `node.exe` terminal windows behind at handoff.
- After any Playwright-driven test/debug run, explicitly verify whether `@playwright/mcp` or `playwright-mcp` processes are still running and terminate the matching top-level `cmd.exe` launcher tree with `taskkill.exe /T /F` if they are.
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
