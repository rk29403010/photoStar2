# Parallel Thread Workflow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared thread-state bookkeeping so parallel chat threads can be registered, updated, and closed with less Git overhead for the user.

**Architecture:** Add a small repo CLI that stores shared worktree metadata in Git's common directory, then update the repo guardrails to require the tracker for parallel work. Keep the tool small and focused on state tracking rather than full Git orchestration.

**Tech Stack:** Node.js, `node:test`, shared repo tooling scripts, Markdown docs.

---

## Chunk 1: Tracker CLI

### Task 1: Add failing thread tracker tests

**Files:**

- Create: `tests/repo/thread-state.test.mjs`
- Modify: `tests/repo/tooling-productivity.test.mjs`

- [ ] Write tests for worktree naming, registry upsert, close semantics, rendered output ordering, and package script exposure.
- [ ] Run `node --test tests/repo/thread-state.test.mjs tests/repo/tooling-productivity.test.mjs` and verify the new tracker assertions fail first.

### Task 2: Implement the shared tracker script

**Files:**

- Create: `tooling/scripts/repo/thread-state.js`

- [ ] Implement registry creation, upsert, close, rendering, and CLI command handling.
- [ ] Resolve the shared registry path through `git rev-parse --git-common-dir`.
- [ ] Capture current branch, commit, dirty status, worktree identity, and managed dev-session note from the current worktree.
- [ ] Re-run `node --test tests/repo/thread-state.test.mjs tests/repo/tooling-productivity.test.mjs` until the tracker tests pass.

## Chunk 2: Repo Wiring

### Task 3: Expose package scripts

**Files:**

- Modify: `package.json`

- [ ] Add `thread:list`, `thread:status`, `thread:register`, `thread:update`, and `thread:close`.
- [ ] Re-run `node --test tests/repo/tooling-productivity.test.mjs` and verify package-script expectations pass.

### Task 4: Teach the repo rules to use the tracker

**Files:**

- Modify: `AGENTS.md`

- [ ] Add a `Parallel Thread Protocol` section.
- [ ] Require agents to register/update/close worktrees and stop using stash as the default memory mechanism.
- [ ] Document the plain-English finish/park/discard mappings so future threads can act on those phrases consistently.

## Chunk 3: Docs And Verification

### Task 5: Save the workflow design and plan docs

**Files:**

- Create: `docs/superpowers/specs/2026-03-30-parallel-thread-workflow-design.md`
- Create: `docs/superpowers/plans/2026-03-30-parallel-thread-workflow.md`

- [ ] Write the concise design doc for the shared tracker workflow.
- [ ] Save this plan file in the repo.

### Task 6: Verify the workflow changes

**Files:**

- Verify: `tests/repo/thread-state.test.mjs`
- Verify: `tests/repo/tooling-productivity.test.mjs`
- Verify: `package.json`
- Verify: `AGENTS.md`

- [ ] Run `node --test tests/repo/thread-state.test.mjs tests/repo/tooling-productivity.test.mjs`.
- [ ] Run `npm.cmd run quality:staged`.
- [ ] Run `npm.cmd run quality` if the staged diff expands beyond the workflow/tooling slice or if repo wiring starts to sprawl.
