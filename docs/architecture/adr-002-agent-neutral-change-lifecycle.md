# ADR-002: Agent-neutral change lifecycle

- Status: Accepted
- Date: 2026-07-16

## Context

PhotoStar2 is maintained from both Codex and Antigravity. Earlier tooling mixed
editor-specific branch names, paths, hooks, and registry concepts with the
actual identity of a change. Local, pre-commit, readiness, merge, and GitHub
checks also selected different files and did not consistently enforce the same
thresholds. This made iteration slower while still allowing false-green merge
paths and stale task artifacts.

The repository needs a fast editing experience, strong integration protection,
and a lifecycle that can be resumed by either editor without colliding over
worktrees, runtimes, ports, generated files, or state records.

## Decision

1. A task is identified by repository-neutral task metadata, a Git worktree,
   and a branch. Editor/agent identity is a transferable ownership lease.
2. Git's worktree list, refs, and commit containment are authoritative. The task
   registry is recoverable metadata and must be auditable and reconcilable.
3. Repository tooling must accept both repository-local and externally managed
   worktrees. No `.worktrees/`, `worktrees/`, or editor-managed root is assumed.
4. `qa:quick`, `qa:ready`, and `qa:merge` are the quality interfaces. They share
   one policy for versions, included files, ignores, thresholds, and diff-base
   semantics. GitHub calls the same integration interface.
5. `ship this change` is the canonical instruction to either editor for full
   integration and verified cleanup. Cleanup occurs only after remote success
   and proof that the task head is contained in `main`.
6. Runtime allocation and cleanup require a task lease and verified process
   identity. Unknown or foreign processes are never killed opportunistically.
7. Registry reconciliation is safe-by-default: dirty, ambiguous, or uncontained
   work is reported, not deleted.

## Consequences

- Normal editing becomes faster because comprehensive type-aware and integration
  checks move to explicit readiness/merge gates.
- Protection is not weakened: `qa:merge` and its GitHub equivalent are required
  at the candidate SHA before `main` integration.
- Either editor can take over a task by inspecting Git/task status and updating
  its lease, without copying work or creating a parallel registry entry.
- Task tooling must support atomic state updates, stale-state audit, safe
  reconciliation, and cross-platform process/port inspection.
- The finish operation can report a blocker and retain recoverable state. It may
  not claim success while a branch, worktree, owned runtime, or stale registry
  record from the completed task remains.

## Rejected alternatives

- Separate Codex and Antigravity registries: this hides collisions and creates
  two incomplete sources of truth.
- Editor-specific worktree roots or branch prefixes as policy: paths and editors
  change, while Git identity and containment remain portable.
- Full type-aware lint on every edit or commit: measured latency makes the local
  loop unnecessarily slow; the required merge gate is the appropriate boundary.
- Cleanup based only on task status labels: labels can be stale, so Git
  containment and clean-state proof are required.
