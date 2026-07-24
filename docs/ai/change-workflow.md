# Change Workflow

This is the editor-neutral operating guide for making and shipping changes to
PhotoStar2. Codex and Antigravity use the same Git worktrees, task registry,
quality policy, runtime ownership rules, and completion language. Repository
policy does not encode editor capability claims because they can change.

## Authoritative vocabulary

- **Task capsule:** the registered unit for one independent task: exactly one
  neutral branch, one task record, one active Git worktree, and an optional
  task-owned runtime.
- **Host:** the stable shell that discovers and orchestrates plug-ins solely
  through their extension contract.
- **Plug-in:** a self-contained feature contribution (including a workflow
  module, photo-editing tool, or future extension-family member) that owns its
  implementation, metadata, tests, and declared registration input.
- **Extension contract:** the versioned boundary that specifies how a host
  discovers, validates, invokes, and presents a plug-in without knowing that
  plug-in's identity or implementation details.
- **Machine-owned registry:** reproducible generated output whose generator and
  declared plug-in inputs determine every entry. Humans edit inputs, never the
  generated registry.
- **Leaf task:** a task capsule assigned a disjoint implementation scope. It
  may not opportunistically refactor files owned by another active task.
- **Integration task:** a task capsule and integration branch that owns shared
  contracts, hosts, generated registries, or other integration files for a
  related set of leaves. Leaves sharing those files target this branch instead
  of competing with separate PRs to `main`.
- **Published:** a committed candidate is pushed and has a deterministic remote
  publication record (normally a PR). It does not mean checks have completed.
- **Merge-queued:** the remote platform has accepted the published candidate
  into its protected merge queue. It does not mean the candidate is merged.
- **Merged:** Git proves the candidate head is contained in its target branch.
- **Cleanup-pending:** merge is proven, but task-owned runtime shutdown, local
  worktree/branch removal, or registry reconciliation remains incomplete.
- **Blocked:** a task cannot safely progress because a required command,
  authority, ownership boundary, or deterministic repository operation failed;
  it retains its recoverable capsule and a precise recovery instruction.

These definitions apply equally to Codex and Antigravity. Editor identity may
be recorded as task metadata but never changes branch names, paths, commands,
or lifecycle rules.

## Extension and ownership contract

- Prefer self-contained plug-ins and deterministic registration. Hosts may
  orchestrate plug-ins but contain no individual plug-in IDs, labels, defaults,
  UI components, or algorithms.
- A host discovers declared plug-in inputs or consumes a deterministic generated
  registry. Hand-maintained catalogues and central switch statements are shared
  edit hotspots to reduce, not normal extension points to preserve.
- Give peer agents disjoint file and contract ownership. A leaf task encountering
  a missing shared extension point records the exact blocker; it does not patch
  another active task's files. An assigned integration task owns the shared
  change and its integration branch.
- Generated registries are machine-owned and reproducible: update their source
  inputs and generator, regenerate, and test the result. Do not edit generated
  registry files manually.
- Photo-editing tool tasks own exactly one directory under `src/services/photoEditing/tools/plugins/<tool>/`; host, registry, and legacy-adapter changes require an assigned integration task. Use `photo-tool:new`, then generate and check the registry.

## Publication and reconciliation lifecycle

1. Create/register a leaf or integration task capsule and assign its ownership
   scope. A runtime is optional and task-owned only when started through task
   tooling.
2. Develop within that scope; run `qa:quick`, then `qa:ready` for handoff.
3. `thread:publish` stops only the recorded task runtime, stages task-owned
   changes excluding generated noise, runs `qa:ready`, commits if needed,
   fetches and safely updates from `origin/main`, runs `qa:merge` at the pushed
   head, creates or reuses a PR, and enables auto-merge. It stores the PR number,
   published SHA, base SHA, and publication time as **merge-queued**, then exits.
4. It never polls checks, waits for Actions, merges the PR itself, updates main,
   reapplies policy, or removes local task state. `thread:ship` is an alias.
5. `task:reconcile` fetches remote state, proves the published SHA is contained
   in `origin/main`, then performs independent cleanup. A cleanup failure remains
   **cleanup-pending**; ambiguity is **blocked**.

## The one finish phrase

Tell either editor:

> **finish this task**

This is authorization to use the intended deterministic publication workflow.
It does not require an agent to remain attached while GitHub checks run. The
agent reports the resulting local and remote lifecycle state, then repository
automation owns remote waiting, merge observation, and later reconciliation.

Run `pnpm.cmd run task:finish` for this sequence. It records validation and
publication evidence durably, returns DONE, WAITING ON CI, FAILED, or ACTION
NEEDED, and does not poll Actions. GitHub owns remote checks and sends the PR
notification. After a restart, `task:status` performs one bounded refresh and
`task:resume -- --task "<task>"` reconstructs the capsule. `thread:publish`
and `thread:ship` remain compatibility commands.

The agent should continue through ordinary, in-scope lint, type, test, merge,
and cross-platform failures. It should not hand back a half-finished task merely
because a check needed a code fix.

If publication or reconciliation is unsafe or impossible, the agent must stop
before destructive cleanup and say clearly:

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
| Edit loop | `pnpm.cmd run qa:quick` | Fast feedback while changing code | Changed, staged, and relevant untracked files; fast lint, complexity, plus native application and core typechecks |
| Readiness | `pnpm.cmd run qa:ready` | Decide whether the branch is reviewable | Complete `base...HEAD` diff plus required affected tests and types |
| Integration | `pnpm.cmd run qa:merge` | Protect `main` locally and in CI | Reproducible comprehensive repository gate at the candidate SHA, including multi-file import-cycle analysis and application type-aware Oxlint |

The command names are the contract. Local hooks and GitHub Actions should call
the same underlying orchestrator rather than recreating file selection,
thresholds, or tool versions.

Moving expensive checks out of the keystroke or pre-commit loop is safe only
because `qa:merge` remains mandatory before integration. Skipping or weakening
`qa:merge` weakens protection on `main`.

### TypeScript compiler arrangement

`@typescript/native` aliases stable TypeScript 7 for the explicit native `tsc`
for command-line typechecking and CommonJS core builds. The quality orchestrator
is the only place that selects this binary; package scripts and CI invoke its
named modes rather than duplicating compiler paths.

The `typescript` dependency remains on 5.9.3 for `typescript-eslint`, ESLint,
Vite plug-ins, and other programmatic API consumers. `typecheck:compat` runs
that API-consumer compiler as an explicit validation; it is not the normal
fast-loop compiler. TypeScript 6 API adoption is deferred because it changes
whole-repository typed-lint results; revisit it only when a dedicated task can
triage those findings and `qa:merge` proves the replacement arrangement.

Use `typecheck:native`, `typecheck:native:app`, and `typecheck:native:core` for
direct native checks. `qa:quick` runs the app and core native checks; `qa:ready`
runs them once for the branch handoff; `qa:merge` runs the app check and uses a
native core build as the core type proof, avoiding a duplicate core typecheck.

The full Oxlint pass enables the `import` plugin and `import/no-cycle`, so it
builds the repository module graph and rejects dependency cycles. The merge
gate also runs Oxlint's `tsgolint`-backed type-aware rules against changed files
in the application TypeScript project. The type program is project-wide, but
the incremental gate avoids making unrelated work repair the existing
type-aware backlog. The fast loop deliberately keeps project-wide type-aware
lint off, but runs native application and core compiler checks. Typed ESLint
continues to use TypeScript 5.9.3 until its programmatic consumers support
TypeScript 7 without changing complete-repository lint results.

The pre-commit hook is stored in Git's shared common directory, so it must work
from old and new worktrees at the same time. It resolves the committing
worktree at runtime and selects `qa:quick` when available, falling back to the
older `quality:staged` interface. Never install a shared hook that directly
references a file which exists only on the installing branch.

## Starting and moving a task between editors

Task identity is its neutral branch plus its registered task record—not the
editor, chat, directory, worktree, clone, or process. One task is bound to one
active workspace at a time. Never actively edit the same task branch in two
workspaces. Follow-up work remains in that task unless the user explicitly
asks to split it. Branch names, task IDs, quality gates, publication, and
status semantics are editor-neutral; an editor-specific branch prefix is never
required.

Create or resume a task worktree through repository tooling:

```powershell
pnpm.cmd run task:start -- --task "<task>" --workspace worktree
```

It safely fast-forwards the primary checkout's `main`, creates or resumes the
neutral task branch, creates/registers an isolated worktree, and prints its
actual path. It supports multiple independent task worktrees. To choose a
non-default location, pass `--path "<actual worktree path>"`; no editor or
directory naming convention is required.

An editor may also create or open a suitable worktree itself, then register it
from that worktree:

```powershell
pnpm.cmd run task:register -- --task "<task>" --workspace worktree
```

Registration and startup refuse dirty workspace transitions, duplicate active
task/branch bindings, and a workspace already bound to another task. `--json`
provides task ID, branch, actual workspace path, and status for agents. An
editor handoff simply resumes the same registered worktree; task ID, branch,
and lifecycle do not change.

- Register the task once. Record the current editor/agent as mutable ownership
  metadata; do not encode it in the task identity.
- An editor taking over an existing task must inspect task status and Git before
  editing. It resumes the registered worktree rather than creating a duplicate
  task.
- Worktree paths may be repository-local or editor-managed. All commands must
  use the actual path reported by Git/task status.
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
- `thread:publish` stops only the runtime proven to belong to its task before
  publication. Reconciliation stops any remaining task-owned runtime after
  merge proof. Unknown listeners are always a blocker, not cleanup candidates.

## Publication, integration, and cleanup

Publishing, queueing, merging, and reconciliation are deterministic repository
operations, not AI reasoning tasks. Repository automation owns remote check
observation after it has published or queued a candidate; agents must not wait
or poll for GitHub Actions.

An integration task is required when related changes share a host, extension
contract, generator, registry input, or other integration file. Its branch is
the merge target for those leaves, and only the integration task publishes the
combined result toward `main`.

Create it with `thread:new-integration`; create leaves with `thread:new-leaf -- --integration "<integration task>"`. Task state stores kind, integration parent, intended base, and publication target, so leaves publish to the integration branch and only the integration task queues to `main`. `task:overlap` is read-only and reports diff-path overlap, architecture hotspots, generated-only overlap, common integration parent, and a continue/coordinate/block recommendation.

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
Use `--task`, `--branch`, or `--worktree` to target a capsule. Successful
cleanup is saved incrementally; a locked Windows path remains cleanup-pending
and reports its precise retry command without hiding unrelated cleanup.
Reconciliation removes clean residual worktrees and local branches only when
Git proves the work is integrated, then closes their metadata. Cleanup is
separate from publication and merge confirmation: a proven merge with retained
local state is **cleanup-pending**. Ambiguous, dirty, or uncontained work
remains visible with a precise recovery instruction.

## GitHub integration

`main` should require pull requests and the canonical merge-gate checks, and
should reject force-pushes and deletion. GitHub Actions must use repository-
pinned Node and pnpm versions, a frozen lockfile, and the same quality policy as
local commands. PR selection uses the merge base; push verification uses the
event's before/after SHAs and must never degrade to an empty working-tree diff.
`repo:protect-main` is an idempotent setup/policy command. It enables
auto-merge and branch updates, then applies required PRs, strict integration
checks, conversation resolution, and force-push/deletion protection.
Publication does not reapply policy.

`advance-merge-queue.yml` runs once after each `main` push. It considers only PRs labelled by `thread:publish`, requires GitHub to report `MERGEABLE`, and updates the PR branch with its observed head SHA. It never resolves conflicts; conflicting PRs remain open with a `queue-advance=conflicting-source` machine-readable comment. Updating preserves auto-merge and reruns required checks. It cannot loop because it is triggered only by a `main` push or explicit dispatch.

The final report for `ship this change` must distinguish local gate success,
published/merge-queued status, proven merge containment, and cleanup state. A
successful local gate is not a remote merge, and a merged candidate can still
be cleanup-pending.
