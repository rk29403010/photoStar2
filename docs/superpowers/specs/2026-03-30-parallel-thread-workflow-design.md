# Parallel Thread Workflow Design

## Goal

Reduce the amount of Git and worktree state a human has to remember when multiple chat threads are active at the same time.

## Constraints

- The workflow must work from the main checkout and linked Git worktrees.
- The user should be able to think in plain-English outcomes such as "merge", "park", and "discard" instead of Git jargon.
- The state source should be shared across worktrees, but should not create routine tracked-repo noise while work is in flight.

## Proposed Design

### Shared thread tracker

Add a small CLI at `tooling/scripts/repo/thread-state.js` that stores a shared registry in Git's common directory. That makes one tracker file visible from every linked worktree without forcing a tracked Markdown ledger to stay dirty during normal work.

Each entry records:

- task name
- branch name
- worktree name and path
- status
- last commit
- dirty/clean state
- managed dev session note
- owner/note metadata
- timestamps

### Status model

Use a small set of explicit states:

- `active`
- `blocked`
- `ready-to-merge`
- `parked`
- `merged`
- `discarded`

This keeps the workflow understandable and maps well to how people describe thread outcomes in chat.

### CLI verbs

Expose five commands:

- `register`
- `update`
- `close`
- `status`
- `list`

These are enough to cover start, progress, handoff, and finish without turning the tool into a full Git wrapper.

### AI workflow rules

Update `AGENTS.md` so agents:

- register independent worktrees when they start
- update status when a thread changes state
- close the thread when it is merged, parked, or discarded
- consult the shared tracker before handoff
- stop using stash as the normal way to remember what belongs to which thread

## Why this design

This gives the user one place to inspect thread state, lets agents keep the tracker fresh as part of normal Git hygiene, and avoids the usual "which worktree owns this change?" confusion without requiring the user to remember Git terminology.
