# Automatic Thread Worktrees Design

## Goal

Make the safe path the default path by treating every new chat conversation as a new isolated worktree unless the user explicitly asks to stay on `main`.

## Problem

The current workflow mixes two different ideas:

- the user-facing language implies that chat threads are isolated lanes of work
- the repo tooling only tracks the current worktree and never creates one automatically

That mismatch makes the tracker misleading when multiple tasks are handled from the same checkout. A "thread" can look merged in the registry while unrelated dirty work keeps accumulating on `main`.

## Constraints

- The repo should keep using Git worktrees for isolation instead of stash-based task parking.
- The workflow must work on Windows and keep using the existing `.worktrees/` convention when present.
- The solution should build on the existing shared thread tracker instead of replacing it.
- The agent must fail fast if isolation cannot be created, rather than silently continuing in the current checkout.

## Proposed Design

### New thread bootstrap command

Add a new CLI entry point at `tooling/scripts/repo/thread-bootstrap.js`, exposed as `npm run thread:new`.

The command should:

- derive a slug from `--task`
- prefer `.worktrees/<slug>` when `.worktrees/` exists and is ignored
- create a new branch `codex/<slug>`
- create a linked worktree with `git worktree add`
- register the new worktree in the shared thread tracker as `active`
- optionally start a managed dev session when `--start-dev` is supplied
- print the created worktree path, branch, and tracker task name

### Main-checkout protection

Update `AGENTS.md` so a new independent chat always starts by creating a dedicated worktree through `thread:new`.

The only allowed exception is an explicit user instruction to stay on `main`. Without that instruction, the agent should not register a new independent thread directly from the main checkout.

### Failure behavior

If `thread:new` cannot create the worktree safely, it should stop with a clear error instead of falling back to the current checkout. Examples:

- target worktree path already exists with different branch state
- target branch name already exists unexpectedly
- no supported worktree directory is available
- the project-local worktree directory is not ignored

### Tracker expectations

The shared tracker remains the source of truth for status, but thread creation becomes explicit and deterministic:

- `thread:new` creates the worktree and registers it
- `thread:update` changes state during work
- `thread:close` closes the thread when merged, parked, or discarded

This keeps one tracker entry per real worktree instead of relying on humans or agents to remember to isolate work first.

## Why this design

This matches the user's mental model: a new chat conversation gets its own lane automatically, and follow-up requests in that conversation stay in the same lane. It removes the most common failure mode, where several tasks accumulate in the same checkout and the tracker only reports the latest story attached to that path.
