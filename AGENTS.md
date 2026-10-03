# AI Guardrails

PhotoStar2 is AI-first. Use model reasoning for product and engineering decisions;
use deterministic repository tooling for repeatable mechanics.

## Priorities

- Work from the current repository, not chat memory or an assumed branch state.
- Read the files that own the behavior before editing them.
- Use `docs/ai/AI_PROJECT_MAP.md` when the subsystem is unfamiliar or a change
  crosses architecture boundaries. Do not load it, or other large architecture
  documents, by ritual for a well-localised change.
- Prefer existing repository scripts over manually reproducing Git, QA, registry,
  runtime, or cleanup procedures.
- When a repeated procedure can be made deterministic, improve the script rather
  than adding another step-by-step instruction here.

## Execution

Complete the requested outcome autonomously. A passing test, checkpoint, commit,
subtask, or benchmark is not a reason to stop while safe in-scope work remains.

Stop only when:

- the requested outcome is complete;
- a genuine product, UX, architecture, data-loss, or scope decision needs the
  user;
- required evidence is unavailable and continuing would require guessing; or
- an external dependency blocks all useful remaining work.

Fix task-caused test, lint, type, or QA failures and continue without asking for
permission. Do not broaden deferred/future work into the current task.

## Workspace, Git, and parallel work

- Codex may use its native worktree, Git, and subagent facilities. Repository
  policy defines safety outcomes, not an editor-specific implementation recipe.
- Keep unrelated changes separate. Parallel writers must have disjoint ownership;
  coordinate shared contracts/integration files before concurrent edits.
- Ordinary non-main worktrees do not need registration ceremony before coding.
  `task:finish` can register an ordinary task lazily when publication is requested.
- Use the advanced task/integration workflow in `docs/ai/change-workflow.md` only
  when work needs shared-runtime ownership, cross-editor handoff, an integration
  branch, custom publication targets, or coordinated overlapping tasks.
- Never discard unrelated or uncommitted work. Avoid destructive Git commands
  unless the user explicitly requests them.
- Publishing/merging is an explicit completion action. When the user asks to
  finish or ship a task, prefer `pnpm.cmd run task:finish` to hand-written GitHub
  procedure.

## Quality: catch problems while the change is fresh

Repository QA is the source of truth for mechanical code-quality rules.

- During implementation run targeted tests plus `pnpm.cmd run qa:quick` at useful
  checkpoints. It intentionally includes changed-file lint, reviewability,
  complexity, and native TypeScript checks so repair work appears early.
- If changed code has routine lint/style findings, use
  `node tooling/scripts/repo/quality-gate.js fix` before spending model reasoning
  on mechanical rewrites, then run `qa:quick`.
- Run `pnpm.cmd run qa:ready` when the requested change is ready for handoff.
- `pnpm.cmd run qa:merge` remains the mandatory integration gate at the exact
  candidate being integrated.
- Do not weaken, bypass, disable, or reclassify a quality gate just to make a
  change pass.

## Reviewability and context budget

Large source files have repeatedly harmed both maintainability and later AI
context. Treat this as a functional constraint, not cosmetic style.

- Prefer small cohesive modules with explicit responsibilities and narrow public
  contracts.
- Do not create or grow a large maintained application source file when the new
  responsibility can be extracted coherently.
- Around 800 lines is the reviewability/refactor threshold. Existing legacy files
  above it may be edited, but should not grow without a compelling reason.
- 1200 lines in maintained application source is a machine-enforced hard stop.
- Changed functions are also machine-checked for size and complexity. Let the QA
  tooling own the numeric thresholds rather than duplicating them in prompts.
- Avoid `any` in maintained TypeScript except at a documented external boundary.

## Runtime evidence

For visible/runtime-facing bugs, establish the observed failure before the first
fix when feasible. Reproduce it and use the relevant runtime, logs, browser tools,
screenshots, or targeted probes to locate the failing boundary. After a failed
fix, gather fresh evidence instead of stacking guesses.

Run a branch-local runtime only when runtime evidence is useful. Do not stop or
replace a runtime owned by another task merely to free a port.

## Secrets and privacy

- Never hardcode credentials, API keys, tokens, or personal identifiers.
- Use environment variables and ignored local environment files through existing
  loaders.
- Never include secrets in fixtures, scratch scripts, docs, commits, or logs.

## Repository-wide architecture invariants

- Extension families use self-contained plug-ins behind small contracts. Hosts
  orchestrate plug-ins generically and must not accumulate per-plug-in IDs,
  labels, defaults, UI components, or algorithms.
- A machine-owned registry is generated output. Change its declared inputs or
  generator and regenerate it; never hand-edit the generated registry.
- Unknown/unavailable persisted extensions must degrade gracefully rather than
  being silently dropped.
- Database schema belongs in normal schema creation. Existing-data migrations,
  backfills, and cleanup are dev-time one-off scripts, not startup work.
- `artifacts/` is disposable generated output; durable project knowledge belongs
  under `docs/`.

## Scoped instructions

More detailed rules live beside the code that needs them. Read the applicable
nested `AGENTS.md` when changing those areas:

- `src/ui/AGENTS.md` - UI, accessibility, themes, feedback, visual resilience.
- `src/services/photoEditing/AGENTS.md` - non-destructive editor and tool plug-ins.
- `src/services/workflowRuntime/AGENTS.md` - workflow/module plug-in boundaries.

Do not copy scoped rules back into this root file. Keep this file short enough to
be cheap context for every task.

## Documentation

Prefer current repository status/handoff documents over historical chat context.
Update `AI_PROJECT_MAP.md` when its routing or architecture information actually
changes. Record only durable unresolved work in `docs/todo.md`; do not create TODO
noise for work completed in the same run.

If a platform-specific tool bug recurs, fix or wrap it in repository tooling
instead of growing this file with shell/quoting folklore.
