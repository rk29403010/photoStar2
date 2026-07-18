# AI Guardrails

Repo-local instructions for AI coding sessions. Prefer commands, evidence, and
repo checks over prose, memory, or vibes.

These rules are editor-neutral. Codex, Antigravity, and other agents must use
the same repository commands, task metadata, quality gates, and finish
semantics. Do not introduce an editor-named branch namespace, worktree root,
registry, hook, port range, or generated-file location as a repository
requirement.

## AI-First Project

This project is **AI-first**, written and maintained through AI prompts rather than directly through manual code edits.

- Design, implement, and refactor code via structured prompt instructions.
- Ensure codebase clarity, simplicity, and comments are optimized for AI context parsing.

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

- Prefer direct executables: `rg.exe`, `git.exe`, `node.exe`, `pnpm.cmd`,
  `npx.cmd`, `python.exe`.
- Use Git Bash only for shell composition: pipes, redirects, globs, `&&`, `||`,
  or command substitution.
- Use PowerShell only when the command is simple valid PowerShell or genuinely
  Windows-specific.
- After one failed tool launch, stop retrying quoting variants. State the failure
  once and use a deterministic fallback.
- Do not launch repo dev scripts in detached visible terminal windows unless the
  user asks.

## Quality Gates & Verification

To maintain fast progress and optimize token usage, quality checking should be offloaded to deterministic local processes (like formatters and linters) with auto-fixing enabled wherever possible.

- **AI-Led Quality Control**: Use `pnpm.cmd run qa:quick` during normal editing.
  Do not run the comprehensive gate after every prompt.
- **Automated Auto-Fixing**: Prefer repository auto-fix commands before a gate
  when they are applicable to the current files.
- **Readiness Gate**: Run `pnpm.cmd run qa:ready` before handing a branch off
  for review. It checks the complete branch diff against its base.
- **Required Merge Gate**: `pnpm.cmd run qa:merge` is the canonical local and CI
  integration gate. It must pass at the exact head being integrated before a
  change may enter `main`.
- Do not substitute legacy `quality*` commands or a manually selected subset
  for `qa:merge` when shipping a change.
- **New Files**: The canonical QA selectors include relevant untracked files.
  Stage first only when deliberately using a staged-only legacy command.
- **Branch/Complexity Monitoring**: Prefer the complexity check included in
  `qa:quick` or `qa:ready`. For isolated diagnosis, pass explicit files to the
  complexity script rather than changing Git state merely to select them.

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

## Error Handling & Visual Resilience

- **Avoid Visual Failures**: Protect the application from "white screen of death" style failures. Major settings screens, tabs, panels, and viewports must be wrapped in React Error Boundaries to isolate runtime rendering errors and keep the remaining UI functional.
- **Fail Gracefully**: UI elements experiencing errors should render a clean fallback UI with diagnostic detail (e.g., an error message or icon with reset options) instead of crashing the parent layout.

### SonarQube & Code Quality Rules

These rules are programmatically checked and enforced by our ESLint setup (using `eslint-plugin-sonarjs`, `eslint-plugin-jsx-a11y`, and `@deslint/eslint-plugin`). The rules listed below are indicative guidelines that the linter automatically verifies:

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

## Styling Guidelines & Theme Integration

1. **Eradicate Inline Styles**: Static `style={{...}}` attributes are strictly forbidden across all components. Static styles must be defined using Tailwind utility classes. Inline styles are reserved ONLY for dynamic, JavaScript-calculated runtime values (e.g., dynamic offset positioning, drag transforms, canvas width/height).
2. **Eliminate Utility Class Soup**: Never use more than 5-7 utility classes on a single element unless it is the root layout container. Avoid long, bloated class strings.
3. **Use React Component Abstraction**: Prefer React component abstractions/wrappers (e.g., `<Button>`, `<IconButton>`, `<Input>`, `<Select>`, `<Checkbox>`, `<Card>`, `<Panel>`, `<Header>`) to encapsulate complex style patterns instead of duplicating styling classes.
4. **Do Not Use `@apply`**: Avoid `@apply` directives in CSS files unless absolutely necessary. Rely on React component encapsulation.
5. **Use Semantic Theming**: Strictly use the custom mapped theme variables for light and dark theme support instead of raw color codes or arbitrary hex values:
   - `bg-surface` / `bg-surface-secondary`
   - `text-content` / `text-content-secondary`
   - `text-brand-accent` / `hover:bg-brand-accent-hover`
6. **No Arbitrary Square Brackets**: Do not use arbitrary square-bracket values for colors or dimensions (e.g., `bg-[#1a1a1a]`, `border-[#333]`, `w-[31px]`, `p-[15px]`). Snap all values to the standard Tailwind sizing/spacing scale (e.g., `p-4`, `w-8`) and standard theme tokens.
7. **Ensure Theme Consistency**: Design and test all new and modified UI components to look correct in both light and dark modes natively via the semantic tokens.
8. **Semantic Styling**: Ensure styles are semantic and not just presentational. For example, use `bg-error`, `border-danger`, etc. instead of arbitrary colors.
9. **Text to background contrast**: Always verify there is sufficient contrast between text and background colors, especially for smaller font sizes. Use WCAG 2.1 AA guidelines (a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text).
10. **Long-Form Text Fields (Caption/Description)**: Display multi-line/long-form text fields underneath the label using a block layout (full column width) rather than squeezed side-by-side. Differentiate editable fields visually with hover background changes, support direct click-to-edit behavior on the whole field container, restrict the display height (e.g., `line-clamp-5`) to prevent layout bloat, and render any source/provenance icons inline directly next to the label. Rationales should be presented via tooltips on the source icon.
11. **Edit Mode UI/UX Continuity**: Entering edit mode for inline or text fields must never cause disruptive layout shifts, font changes, or introduce bulky background frames or borders. The input field (e.g., input, textarea, select) must match the display text's typography (font size, weight, line height, padding) precisely. Indicate the active editing state subtly (e.g., with a dashed bottom border or minor background color shift) rather than shifting layout. Action buttons (Save/Cancel) must be rendered as compact, clean icons and placed on the same line as the label (or right-aligned at the end of the row) to avoid shrinking the usable width of the text input area.
12. **Full-Width Text Elements**: Ensure text and input fields span the full available width of their parent containers. Avoid arbitrary right-side padding, fixed margins, or spacing blocks (like `pr-12` or `mr-6`) that compress readable text into a narrow, squashed column.
13. **High Contrast Color Pairings**: Never pair light text with light backgrounds or dark text with dark backgrounds. For colored badges (like pending/AI suggestions), use highly contrasting pairs (e.g., dark text like `text-amber-900` on a light background like `bg-amber-100` for light mode, and light text like `text-amber-200` on a dark background like `bg-amber-950` for dark mode) to ensure they are fully WCAG 2.1 AA compliant.
14. **Visual Aesthetics and WOW Factor**: Every UI element must look premium, polished, and intentional. Use subtle border-radius (e.g., `rounded`, `rounded-md`), modern subtle shadows (`shadow-sm`), and transition utilities (`transition-all duration-150`) for interactive states. Do not build plain, basic, unstyled HTML interfaces.
15. **Edit State Contrast**: When a field is being edited, do not change the background color of the field container. The edit state should be distinguished solely by the focused input with its dashed bottom border and compact icons, maintaining visual structure.
16. **Text Overflows & Wrapping**: In lists or metadata panels, ensure long text wraps nicely using `break-words` or has clear limits (e.g., `line-clamp`), and is never clipped abruptly or forced into a tiny row that causes vertical overflow.

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

- One task equals one task capsule: one worktree, one branch, one goal. A task
  may move between Codex and Antigravity; the editor is metadata, not identity.
- Discover worktrees from Git and the shared task registry. Do not assume the
  task lives under `.worktrees/`, `worktrees/`, or an editor-managed directory.
- Use a neutral branch name accepted by the task tooling. Do not require an
  editor-specific prefix.
- New independent task:

```bash
pnpm.cmd run thread:new -- --task "<task name>"
```

- Follow-up requests stay in the same worktree unless the user asks to split.
- Register existing worktrees with `pnpm.cmd run thread:register -- --task "<task name>"`.
- Update state with `pnpm.cmd run thread:update -- --status <active|blocked|ready-to-merge|parked>`.
- Close finished threads with `pnpm.cmd run thread:close -- --status <merged|parked|discarded>`.
- Audit all live and stale task state with `pnpm.cmd run task:audit`. Use
  `pnpm.cmd run task:reconcile` only after reviewing its dry-run output.
- Before handoff, run `pnpm.cmd run thread:status`; use `pnpm.cmd run thread:list`
  when reporting active threads. Report the worktree path, branch, running
  script, app URL, and backend port shown there.
- Tell the user the worktree path, branch, and current app URL/port state when
  work starts.
- Do not leave dirty active worktrees unregistered.
- Never delete a worktree or branch until Git proves its committed head is
  contained in the destination branch. Never remove uncommitted files as
  cleanup.

Runtime ownership:

- New threads are edit-only by default.
- Use `pnpm.cmd run thread:start-dev` only when branch-local runtime verification
  or interactive debugging is needed.
- When a thread becomes runtime-owning, state the exact app URL and backend port.
  Use `pnpm.cmd run thread:runtime-url` for a quick check and
  `pnpm.cmd run thread:doctor` when multiple instances or stale ports are likely.
- Promote before signoff for visible UI, desktop runtime, routing, app state,
  backend wiring, persistence, imports/exports, background jobs, or meaningful
  user-visible side effects.
- Do not merge into `main` just to run or verify a branch.
- Treat existing `dev:*` sessions as user-owned unless this task started them or
  the user asked to stop them.

Runtime handoff commands must use the actual path reported by task status, not
an assumed editor-owned directory. Example:

```bash
cd <reported-worktree-path>
pnpm.cmd run dev:desktop-runtime
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
- Prefer targeted verification plus `pnpm.cmd run quality:staged` while iterating.
- Use `pnpm.cmd run dev:impact` before recommending a runtime restart.

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

- `ship this change`: canonical editor-neutral end-to-end finish command. Run
  `pnpm.cmd run thread:ship`, fix in-scope failures, and retry until it completes.
  This includes the full merge gate, commit, protected integration into `main`,
  push, remote-check and containment verification, stopping the task-owned
  runtime, and removing the integrated branch/worktree. Then audit and safely
  reconcile the task registry. Continue through fixable failures without
  returning a partial handoff. If safe completion is impossible, stop before
  destructive cleanup and report the failed command, concrete cause, retained
  worktree and branch, and the exact recovery action.
- `ship it` and `finish this thread and merge it back` are aliases for
  `ship this change`.
- `finish this thread, commit it, and keep the branch`: commit, mark ready.
- `make a WIP commit and park this thread`: WIP commit, close as parked.
- `discard this thread`: confirm before destructive cleanup, close discarded.

The authoritative workflow and completion checklist are in
`docs/ai/change-workflow.md`.

## Dependencies

- Use a separate `node_modules` per worktree backed by pnpm's shared global
  content store. Install only when the task needs to run checks or a runtime.
- `thread:new -- --share-dependencies` is an explicit speed/risk opt-in for a
  task that will not change dependency manifests or native packages. Never use
  writable shared `node_modules` concurrently when lockfiles or dependencies
  may change.

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

## Workflows and Modules

- Workflows and modules must be completely self-contained and self-describing.
- Never hardcode workflow presentation details (like fallback names, display labels, or stages) outside the actual workflow definition files.
- If a workflow configuration or definition is not found in the registry, the system must degrade gracefully (e.g., return the workflow ID itself as the fallback name and leave the stage undefined), rather than introducing hardcoded dependencies or lookup tables.
