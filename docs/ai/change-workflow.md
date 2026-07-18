# Change Workflow

This is the editor-neutral operating guide for making and shipping changes to
PhotoStar2. Codex and Antigravity use the same Git worktrees, task registry,
quality policy, runtime ownership rules, and completion language.

## The one finish phrase

Tell either editor:

> **ship this change**

This is authorization to take the current task through the complete safe finish
sequence. It means:

1. Confirm the current worktree, branch, base, head, dirty state, ownership, and
   task-owned runtime.
2. Run `pnpm.cmd run thread:ship`. This is the repository automation for the
   remaining gate, commit, protected integration, verification, and cleanup
   steps.
3. Fix failures caused by the current change and rerun `thread:ship`. It runs
   `qa:merge` at the exact candidate head before integration.
4. Confirm the task head is contained in the pushed `main`, the task-owned
   runtime is stopped, and the integrated local worktree/branch are removed.
5. Run `pnpm.cmd run task:audit`, inspect `pnpm.cmd run task:reconcile`, and
   apply its proven-safe registry plan with
   `pnpm.cmd run task:reconcile -- --apply`.
6. Report the commit, pushed branch, checks, containment proof, cleanup, and
    any unrelated state deliberately left untouched.

The agent should continue through ordinary, in-scope lint, type, test, merge,
and cross-platform failures. It should not hand back a half-finished task merely
because a check needed a code fix.

If completion is unsafe or impossible, the agent must stop before destructive
cleanup and say clearly:

- which command or required check failed;
- the concrete error or missing authority;
- whether the change is committed, pushed, or included in `main`;
- the exact retained worktree and branch;
- whether a runtime is still running and where;
- the smallest action needed to resume.

Uncommitted work, a head not proven to be in `main`, an unknown process owner,
or an unavailable protected-branch decision is never cleaned up by assumption.

## Working modes

| Mode | Command | Purpose | Expected scope |
| --- | --- | --- | --- |
| Edit loop | `pnpm.cmd run qa:quick` | Fast feedback while changing code | Changed, staged, and relevant untracked files; fast lint, complexity, and targeted checks |
| Readiness | `pnpm.cmd run qa:ready` | Decide whether the branch is reviewable | Complete `base...HEAD` diff plus required affected tests and types |
| Integration | `pnpm.cmd run qa:merge` | Protect `main` locally and in CI | Reproducible comprehensive repository gate at the candidate SHA, including multi-file import-cycle analysis and application type-aware Oxlint |

The command names are the contract. Local hooks and GitHub Actions should call
the same underlying orchestrator rather than recreating file selection,
thresholds, or tool versions.

Moving expensive checks out of the keystroke or pre-commit loop is safe only
because `qa:merge` remains mandatory before integration. Skipping or weakening
`qa:merge` weakens protection on `main`.

The full Oxlint pass enables the `import` plugin and `import/no-cycle`, so it
builds the repository module graph and rejects dependency cycles. The merge
gate also runs Oxlint's `tsgolint`-backed type-aware rules against changed files
in the application TypeScript project. The type program is project-wide, but
the incremental gate avoids making unrelated work repair the existing
type-aware backlog. The fast loop deliberately keeps both project-wide modes
off. Typed ESLint and both `tsc` projects remain required until Oxlint coverage
is proven equivalent across the application and CommonJS backend projects.

The pre-commit hook is stored in Git's shared common directory, so it must work
from old and new worktrees at the same time. It resolves the committing
worktree at runtime and selects `qa:quick` when available, falling back to the
older `quality:staged` interface. Never install a shared hook that directly
references a file which exists only on the installing branch.

## Starting and moving a task between editors

- Use one branch and one worktree per independent task.
- Register the task once. Record the current editor/agent as mutable ownership
  metadata; do not encode it in the task identity.
- An editor taking over an existing task must inspect task status and the Git
  worktree before editing. It updates the owner/lease rather than creating a
  duplicate task.
- Worktree paths may be repository-local or editor-managed. All commands must
  use the actual path reported by Git/task status.
- Branch names should describe the change. An editor prefix is optional local
  information, never a lifecycle requirement.
- Generated content belongs inside the task worktree or a configured disposable
  directory and must stay ignored. Do not share writable generated output
  between concurrent tasks.
- Each worktree owns its `node_modules` while pnpm reuses its global content
  store. Shared writable `node_modules` is opt-in only for dependency-stable
  tasks and must not be used when either editor may change dependency metadata.

Use these visibility commands:

```powershell
pnpm.cmd run thread:status
pnpm.cmd run thread:list
pnpm.cmd run task:audit
```

Task status should expose, where available: task ID and owner, worktree, branch,
base and head, dirty/untracked state, ahead/behind counts, whether the head is
already included in `main`, runtime URL and ports, completed checks, readiness
SHA, and stale reason.

## Runtime and port ownership

- Tasks are edit-only unless runtime verification is needed.
- Start a runtime through task tooling so its URL, ports, PID identity, command,
  and worktree are recorded.
- Never assume a port belongs to the current task. Check its ownership lease and
  process identity before stopping it.
- Never stop a runtime belonging to another task/editor to make a port free.
- `ship this change` stops only the runtime proven to belong to the shipped
  task. Unknown listeners are a blocker, not cleanup candidates.

## Cleanup and stale-state recovery

`git worktree list` and Git commit containment are authoritative. The task
registry adds metadata and may be reconciled, but must not override Git facts.

Run `pnpm.cmd run task:audit` to inspect active, ready, merged, missing, and
stale tasks. Audit is read-only. It should identify at least:

- missing registered worktrees;
- dirty worktrees;
- branches already contained in `main`;
- merged tasks with residual worktrees or branches;
- expired ownership/runtime leases;
- duplicate worktree, branch, or port claims;
- registry records that disagree with Git.

Run `pnpm.cmd run task:reconcile` to inspect its dry-run plan, then
`pnpm.cmd run task:reconcile -- --apply` to apply proven-safe registry cleanup.
Reconciliation removes clean residual worktrees and local branches only when
Git proves the work is integrated, then closes their metadata. Ordinary cleanup
remains the responsibility of `thread:ship`; reconciliation is the recovery
path for an interrupted finish. Ambiguous, dirty, or uncontained work remains
visible with a precise recovery instruction.

## GitHub integration

`main` should require pull requests and the canonical merge-gate checks, and
should reject force-pushes and deletion. GitHub Actions must use repository-
pinned Node and pnpm versions, a frozen lockfile, and the same quality policy as
local commands. PR selection uses the merge base; push verification uses the
event's before/after SHAs and must never degrade to an empty working-tree diff.
After a successful first integration, `thread:ship` applies this protection
idempotently through `repo:protect-main`; failure to apply it is reported as an
incomplete finish rather than silently leaving direct pushes enabled.

The final report for `ship this change` must distinguish local gate success from
remote required-check success. A successful local merge with a failed or
unverified protected check is not complete.
