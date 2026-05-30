# AI Guardrails

Repo-local instructions for AI coding sessions. Prefer commands, evidence, and
repo checks over prose, memory, or vibes.

## Verbosity & Noise (CRITICAL)

1. **Zero Narration**: Never output "Prioritizing Tool Usage," "Thinking about tools," or any other process narration.
2. **Internal Reasoning Only**: All tool selection logic must stay in the `<thought>` block.
3. **Minimum Tokens**: Adhere strictly to `<user_global>`. If a response can be a single word or a direct code block, do not add headers, summaries, or politeness.

## Secrets & Privacy (CRITICAL)

1. **No Hardcoded Secrets/Keys**: NEVER hardcode API keys, credentials, tokens, or personal identifiers in any code, configuration, scratch script, or documentation.
2. **Use Environment Variables**: Always retrieve secrets from environment variables (e.g., `process.env.GEMINI_API_KEY`) and load them from `.env.local` (which is ignored by git) using loaders like `loadLocalEnvFile()`.
3. **Verify git status**: Always double-check git diffs and status to ensure no keys or environment files are staged.

## Operating Loop

1. Confirm worktree, branch, and dirty state.
2. Read the directly relevant files.
3. Consult `docs/ai/AI_PROJECT_MAP.md` for project intelligence, routing, and domain knowledge before exploring.
4. Update `docs/ai/AI_PROJECT_MAP.md` whenever making structural changes, adding modules/workflows, or changing data models.
5. Make the smallest complete vertical change.
6. Run targeted checks while iterating.
7. Run the right handoff gate before claiming success.
8. Add a concise `docs/todo.md` entry for any follow-up, caveat, or cleanup item
   mentioned to the user.

## Windows Commands

- Prefer direct executables: `rg.exe`, `git.exe`, `node.exe`, `npm.cmd`,
  `npx.cmd`, `python.exe`.
- Use Git Bash only for shell composition: pipes, redirects, globs, `&&`, `||`,
  or command substitution.
- Use PowerShell only when the command is simple valid PowerShell or genuinely
  Windows-specific.
- After one failed tool launch, stop retrying quoting variants. State the failure
  once and use a deterministic fallback.
- Do not launch repo dev scripts in detached visible terminal windows unless the
  user asks.

## Quality Gates

- Never commit code that fails `npm.cmd run quality`.
- Partial work: run `npm.cmd run quality:staged`.
- Core/runtime changes: run `npm.cmd run test:core`.
- UI model changes: run `npm.cmd run test:ui`.
- Repo/tooling changes: run `npm.cmd run test:repo`.
- Larger changes, config/runtime wiring, or handoff-ready work: run
  `npm.cmd run quality`.
- Branch-heavy TS/TSX, React render shells, coordinator code, or several new
  boolean branches: run `npm.cmd run complexity:staged` early.
- Noisy index: pass explicit files, for example
  `npm.cmd run complexity:staged -- --files=src/foo.ts,src/bar.tsx`.

## Code Shape

- App TS/TSX is maintained source unless the file says otherwise.
- No `any` without a documented boundary reason.
- Prefer named helpers, explicit names, boring control flow, and object params for
  larger argument lists.
- Changed TS functions should stay within cyclomatic `<= 10`, cognitive `<= 20`,
  and `<= 90` LOC.
- Treat 800 lines as a refactor prompt and 1200 app-code lines as a hard stop.
- Start extracting before a changed function reaches about cyclomatic 8,
  cognitive 15, or 70 LOC.
- React render bodies should mostly do state/hooks/wiring. Extract derived data
  and conditional UI before render code becomes branch-heavy.
- Do not pass refs into plain JSX helper functions; keep refs at component,
  hook, effect, or event-handler boundaries.
- Do not add lint disables unless the reason is written inline.

### SonarQube & Code Quality Rules

- **Accessibility:**
  - Use native `<dialog>` tags instead of `<div role="dialog">` (S6819).
  - Avoid non-native interactive elements. Use native HTML elements like `<button>`, `<input>`, or `<a>` whenever possible instead of adding `role="button"` to `<div>` or `<span>` (S6819, S6848).
  - Visible, non-interactive elements with click handlers must have at least one keyboard listener (e.g., `onKeyDown`) and a `tabIndex` if they are intended to be interactive (S1082).
  - `tabIndex` should only be declared on interactive elements (S6845).
  - `img` elements must have an `alt` prop (S1077).
- **String Handling:**
  - Prefer `String#replaceAll()` over `String#replace()` for global replacements (S7781).
  - Avoid default object stringification (`[object Object]`) by ensuring objects are properly serialized or accessed before being used in template literals or string concatenations (S6551).
- **TypeScript & Logic:**
  - Remove redundant type aliases (S6564).
  - Avoid redundant use of the `void` operator (S3735).
  - Avoid unexpected negated conditions; prefer positive logic where possible (S7735).
  - Avoid using array indices as React `key` props (S6479).
  - Ensure union types don't have redundant members (e.g., "all" being overridden by "string") (S6571).

## Feedback Framework

- All new user-visible feedback must go through the shared feedback framework and must declare a mode before implementation.
- Use `tracked` for manual multi-step or multi-item processes with long-running progress.
- Use `inline` for slower single-item manual flows that need local contextual feedback.
- Use `transient` for short-lived notices, status updates, and undo affordances.
- Do not add direct ad hoc status-bar strings, toasts, task popups, or inline badges outside the shared framework adapters.
- Workflow/manual task feedback must consume shared workflow/job event wiring instead of introducing side-channel polling or state paths.

## Runtime Evidence

For visible or runtime-facing bugs, gather evidence before changing code. This
includes rendered UI, scrolling, selection, navigation, layout, timing, async
state, desktop runtime behavior, persistence, imports/exports, background jobs,
and cross-layer sync.

Before a first fix when feasible:

1. Reproduce with concrete steps.
2. Run the relevant thread-owned runtime.
3. Identify the failing boundary with logs, instrumentation, screenshots,
   browser/devtools, or targeted probes.
4. State observed behavior before editing.

After a failed fix, gather fresh evidence before another change. After two failed
attempts on the same behavior, switch to root-cause isolation.

For menu actions and workflow starters, verify: exported action, parent binding,
prop forwarding, render condition, correct visible control, click path, backend
command/workflow start, and user-visible feedback.

## Worktrees And Runtime

- One chat thread equals one task capsule: one worktree, one branch, one goal.
- New independent task:

```bash
npm.cmd run thread:new -- --task "<task name>"
```

- Follow-up requests stay in the same worktree unless the user asks to split.
- Register existing worktrees with `npm.cmd run thread:register -- --task "<task name>"`.
- Update state with `npm.cmd run thread:update -- --status <active|blocked|ready-to-merge|parked>`.
- Close finished threads with `npm.cmd run thread:close -- --status <merged|parked|discarded>`.
- Before handoff, run `npm.cmd run thread:status`; use `npm.cmd run thread:list`
  when reporting active threads. Report the worktree path, branch, running
  script, app URL, and backend port shown there.
- Tell the user the worktree path, branch, and current app URL/port state when
  work starts.
- Do not leave dirty active worktrees unregistered.

Runtime ownership:

- New threads are edit-only by default.
- Use `npm.cmd run thread:start-dev` only when branch-local runtime verification
  or interactive debugging is needed.
- When a thread becomes runtime-owning, state the exact app URL and backend port.
  Use `npm.cmd run thread:runtime-url` for a quick check and
  `npm.cmd run thread:doctor` when multiple instances or stale ports are likely.
- Promote before signoff for visible UI, desktop runtime, routing, app state,
  backend wiring, persistence, imports/exports, background jobs, or meaningful
  user-visible side effects.
- Do not merge into `main` just to run or verify a branch.
- Treat existing `dev:*` sessions as user-owned unless this task started them or
  the user asked to stop them.

Runtime handoff block format:

```bash
cd /c/Users/robin/Projects/photoStar2/.worktrees/<worktree-name>
npm.cmd run dev:desktop-runtime
```

## Subagents And Handoffs

- Use subagents for independent, bounded side tasks that can run while the main
  thread keeps moving.
- Give each subagent a clear read or write scope. For code edits, use disjoint
  file ownership and remind the subagent not to revert other work.
- Keep integration, verification, and final signoff in the main thread.
- When delegating, tell the user what was handed off and fold the result back
  into the main thread with evidence.

## Fast Loop

- Default to the fastest safe path for small local fixes.
- `just do it` or `JDI`: skip formal skill/planning workflows for small,
  low-risk work.
- `JDI` does not waive runtime evidence for runtime-facing bugs.
- Keep exploration tight.
- Prefer targeted verification plus `npm.cmd run quality:staged` while iterating.
- Use `npm.cmd run dev:impact` before recommending a runtime restart.

## Git Ownership

The AI owns git hygiene for files it creates, edits, deletes, stages, or commits.

Before commit:

1. Run `git.exe status --short`.
2. Identify unrelated staged/unstaged changes.
3. Stage only relevant files.
4. Summarize `git.exe diff --cached --stat`.
5. Commit only after the relevant gate passes.
6. Run `git.exe status --short` again and report leftovers.

Do not sweep unrelated changes into commits. Do not leave partial staging unless
asked. Never use destructive git commands such as `git reset --hard` or
`git checkout --` unless explicitly requested.

Finish commands:

- `ship it`: commit, merge to `main`, push, close as merged.
- `finish this thread and merge it back`: clean, merge, close as merged.
- `finish this thread, commit it, and keep the branch`: commit, mark ready.
- `make a WIP commit and park this thread`: WIP commit, close as parked.
- `discard this thread`: confirm before destructive cleanup, close discarded.

## Dependencies

- Do not install per worktree by default.
- Install or rebuild only when the thread needs to run and dependencies are not
  usable.
- Be careful with shared `node_modules`; native packages and lockfile drift can
  break it.

## Browser Cleanup

After Playwright-driven test/debug runs, check for `@playwright/mcp` or
`playwright-mcp` processes and terminate matching top-level launcher trees with
`taskkill.exe /T /F` if they remain.

## Artifacts

- Treat `artifacts/` as disposable generated output.
- Put durable plans, specs, and project knowledge in `docs/`, not `artifacts/`.
- Version files under `artifacts/` only when explicitly requested.

## Database Migrations

- Any database migrations, backfills of existing records, or data cleanup tasks must be implemented as dev-time one-off scripts (e.g. under `tooling/scripts/repo/`), rather than during application startup runtime initialization (such as `initSchema`).
- Database schema changes (DDL) should be applied to standard DB creation and schema scripts so that deleting the DB and starting from scratch is always possible.
