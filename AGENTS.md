# AI Guardrails

These rules exist because generated code drifts toward noise unless the repo pushes back.

## Required standard

- Keep files reviewable, but do not scatter cohesive code just to satisfy a low line-count limit. Treat 800 lines as a refactor prompt and 1200 lines in app code as the hard stop.
- Keep functions reviewable. Prefer extracting logic before a function approaches 90 lines or complexity 10.
- Treat function complexity and function-size gates as hard constraints while generating code, not cleanup work for later. Treat file size as an advisory signal until app code approaches the higher hard limit.
- Start extracting before the hard limits: if a changed TS/TSX function is likely to reach cyclomatic 8, cognitive 15, or 70 LOC, split logic into named helpers/components before adding more branches.
- Start splitting files before the hard limit when there is a clean responsibility boundary to extract. Use ~800 lines as the point to pause and consider a split, and avoid pushing app code past 1200 lines.
- Do not assume `src/App.tsx` or other application TS/TSX files are generated; treat them as maintained source unless the file itself clearly says otherwise.
- No `any` unless there is a documented boundary reason.
- Prefer small, named helpers over nested conditionals.
- Prefer object parameters once a function grows beyond a few positional arguments.
- In React render code, do not pass refs into plain helper functions that return JSX. Keep refs at the JSX/component boundary or inside hooks/effects/event handlers so `react-hooks/refs` does not flag possible render-time ref reads.
- Do not add new lint disables unless the reason is written inline.
- Do not commit code that fails `npm run quality`.
- For partial work, at minimum make changed files pass `npm run quality:staged`.
- Changed TS functions should stay within the local guardrails: cyclomatic `<= 10`, cognitive `<= 20`, LOC `<= 90`.

## Expected workflow

1. For TS/TSX edits, check touched file size first; if a file is nearing 800 lines, pause and decide whether there is a clean responsibility split before adding more behavior.
2. Make the change.
3. Run `npm run quality:staged` while iterating.
4. Treat `npm run lint:fast:staged` as the fast guardrail for cyclomatic complexity plus function LOC. It also warns when files exceed the advisory 800-line threshold.
5. If you touched branch-heavy TS/TSX, React render shells, coordinator/orchestration code, or added several boolean conditions, run `npm run complexity:staged` immediately, not just before commit. This remains the cognitive-complexity backstop.
6. If the index is noisy or contains unrelated staged files, run the changed-file scripts with explicit ownership lists instead of broad staged mode, for example `npm run complexity:staged -- --files=src/foo.ts,src/bar.tsx`.
7. Before editing application code while a managed dev session is running, pause it with `npm run dev:pause`; once edits and immediate verification are complete, resume it with `npm run dev:resume`.
8. Run `npm run quality` before handing over larger changes.
9. Use `npm run complexity:report -- --top 20 --min-cyclomatic 10` if code starts to sprawl.

## Runtime-First Debugging Protocol

- Treat live-behavior bugs as evidence-gathering tasks first and code-change tasks second.
- For user-visible bugs or regressions involving rendered UI, scrolling, selection, navigation, layout, timing, async state, desktop-runtime behavior, persistence, or cross-layer synchronization, gather runtime evidence before attempting a fix.
- Do not rely on static code reading alone for issues whose correctness is judged by running the app. Unit tests, wiring tests, and code inspection are useful support, but they are not sufficient on their own for these bug classes.
- For UI action wiring, do not stop at "the prop exists somewhere". Trace the full live path: action creation/composition, parent callback binding, every intermediate prop handoff, render-time conditional, and the final visible UI in the running app.
- Before the first fix attempt on a runtime-facing bug, do all of the following when feasible:
  - reproduce the issue with exact steps;
  - run the relevant thread-owned runtime;
  - identify the failing boundary or state transition with logs, instrumentation, screenshots, browser/devtools inspection, or targeted probes;
  - state the concrete observed behavior before editing code.
- Prefer temporary instrumentation at the narrowest useful boundary over broad speculative refactors. Log the specific state, event, or payload needed to distinguish competing explanations.
- If a bug affects visible interaction behavior, prefer adding or updating a repeatable repro harness such as a targeted runtime test, browser automation flow, or focused integration test before polishing the implementation.
- When a thread already owns a managed runtime, use that runtime for investigation before proposing further fixes unless there is a clear reason not to.
- For new or changed menu actions, verify the whole vertical slice before claiming success:
  - the action exists in the exported action set or command creator;
  - the parent/container binds the callback;
  - every intermediate component or helper forwards the prop or handler;
  - the render-time conditional that shows the menu item is satisfied in the live app;
  - the correct menu button is opened in runtime, not a different similarly named control;
  - clicking the item reaches the intended command or workflow start path;
  - any expected user feedback appears, such as a toast, status line, drawer, progress panel, or refreshed view.
- For menu items that start workflows or background work, verify both the command start path and the user-visible progress path. A successful backend run without the expected progress surface is not a complete fix.

## Failed-Fix Escalation

- If the first fix attempt does not resolve the reported behavior, stop and gather new evidence before making another code change.
- Do not stack multiple speculative fixes onto the same bug without fresh runtime evidence between attempts.
- After two unsuccessful fix attempts on the same behavior, switch from implementation mode to root-cause isolation mode:
  - add or refine instrumentation;
  - narrow the failing layer or boundary;
  - compare against a known-good path or working reference;
  - update the user on the observed evidence before making more edits.
- Repeated plausible fixes without behavioral change are a process failure. The correct response is to strengthen the evidence, not to keep patching.
- For interactive or timing-sensitive bugs, do not claim a fix based only on code inspection. Reproduce the original scenario and verify the observed behavior changed in the running app or an equivalent runtime harness.
- After a failed UI wiring fix, add or tighten a regression test that covers the full vertical slice, not just one layer. Prefer checks that prove the action is composed into the exported action set and threaded into the rendered component path, not merely that a label string exists in a leaf component.

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
- As soon as work starts in a worktree, tell the user explicitly that the task is being done in a worktree, give the full worktree path, and give the branch name. Do not leave the user to infer this.
- Whenever handing off work that should be manually run or tested in a worktree, include a single paste-ready Git Bash code block with exactly two lines: first `cd` into the worktree folder, then the correct run command, typically `npm.cmd run dev:desktop-runtime`. Prefer this exact format unless a different command is genuinely required.
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

## Thread Runtime And Dependency Policy

- Treat worktree isolation and runtime ownership as separate decisions.
- Every independent task still gets its own worktree with `npm run thread:new -- --task "<task name>"` unless the user explicitly asks to stay on `main`.
- Prefer to keep feature work in worktrees until the user has manually tested it and said it is done. Do not merge work back into `main` before that unless the user explicitly asks for it.
- New threads start as `edit-only` by default. That means the thread has its own worktree but does not automatically start a managed dev session.
- Promote a thread to `runtime-owning` with `npm run thread:start-dev` when the task needs branch-local manual verification, interactive debugging, or runtime-specific inspection.
- For this repo, do not assume automated tests or quality scripts prove the feature works from a user point of view. They are regression guards, not a substitute for running the branch.
- If a change affects visible UI, desktop-runtime behavior, routing, app state, backend wiring, or environment-sensitive logic, prefer running that thread in its own worktree before signoff.
- Do not merge into `main` just to run or verify a branch. If the thread needs runtime verification, run it in that worktree.
- Do not auto-start managed dev sessions for every new thread. Start them when the thread reaches the point where real branch-local verification is required.
- Prefer keeping only the threads currently being verified or debugged as `runtime-owning`. Leave the rest as `edit-only` to reduce process and port sprawl.
- When a thread owns a managed dev session, record that in the tracker note so the active runtime context is visible to the next thread.

## Runtime Promotion Triggers

- Promote a thread to `runtime-owning` before signoff if the task changes anything the user would normally judge by running the app rather than by reading code or test output.
- Promote a thread to `runtime-owning` when the change affects rendered UI, interaction flow, desktop-runtime behavior, state transitions, navigation, persistence, imports or exports, background jobs, or any feature with meaningful user-visible side effects.
- Promote a thread to `runtime-owning` when the assistant cannot honestly verify the outcome from targeted checks alone.
- If there is reasonable doubt about whether automated checks are enough, prefer starting the thread runtime rather than guessing.
- A thread may remain `edit-only` through handoff only when the change is genuinely non-runtime-facing, such as docs, comments, narrow refactors with unchanged behavior, or well-covered internal fixes where the runtime path is not part of the claim being made.

## Thread Dependency Policy

- Treat per-thread runtime as normal when branch-local verification is needed, but treat full dependency duplication as something to minimise.
- Do not assume every worktree needs a fresh full install just because it exists. Install or rebuild dependencies when the thread actually needs to run and the current dependency state is not already usable.
- Prefer solutions that preserve branch isolation while sharing dependency artifacts safely, such as the package-manager cache or a shared content-addressed store.
- Be cautious with ad hoc shared `node_modules` linking across worktrees in this repo. Native dependencies and lockfile drift can make that fragile.
- If repeated thread-local installs become a bottleneck, prefer evaluating a package-manager workflow that shares package contents across worktrees cleanly rather than weakening worktree isolation for convenience.

## Fast loop defaults

- Default to the fastest safe path for local edits, bugfixes, refactors, and small behavior changes.
- If the user says `just do it` or `JDI`, treat that as an explicit instruction to skip superpowers/skill workflows and take the fastest safe execution path for the current request.
- The `just do it` / `JDI` shortcut applies only to small, low-risk work in this repository. Do not use it for architectural changes, large multi-step features, risky migrations, security-sensitive work, or anything that would normally need design clarification.
- Even in `just do it` / `JDI` mode, still follow the quality and verification expectations in this file, keep exploration tight, and ask a brief question if a risky ambiguity would otherwise force a guess.
- `just do it` / `JDI` does not waive the runtime-first debugging protocol for runtime-facing bugs. Fast iteration still requires evidence before repeated fixes.
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
