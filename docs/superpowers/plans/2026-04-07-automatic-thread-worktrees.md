# Automatic Thread Worktrees Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new chat conversation start in its own Git worktree by default, with tracker registration happening as part of the same bootstrap flow and follow-up requests in that conversation staying there.

**Architecture:** Add a small bootstrap CLI that creates a branch and linked worktree, then registers that worktree in the existing shared tracker. Update repo guardrails and tooling tests so agents stop treating tracker registration as a substitute for worktree creation.

**Tech Stack:** Node.js repo tooling, Git worktrees, shared thread tracker CLI, `node:test`, Markdown docs.

---

## Chunk 1: Bootstrap CLI

### Task 1: Cover the new thread bootstrap behavior with tests

**Files:**

- Create: `tests/repo/thread-bootstrap.test.mjs`
- Modify: `tests/repo/tooling-productivity.test.mjs`

- [ ] Add tests for slug creation, worktree-directory preference, branch naming, and argument validation.
- [ ] Add package-script assertions for `thread:new`.
- [ ] Run `node --test tests/repo/thread-bootstrap.test.mjs tests/repo/tooling-productivity.test.mjs` and verify the new expectations fail first.

### Task 2: Implement the bootstrap script

**Files:**

- Create: `tooling/scripts/repo/thread-bootstrap.js`
- Modify: `tooling/scripts/repo/thread-state.js`

- [ ] Implement helpers for slug generation, preferred worktree directory discovery, and branch/worktree path derivation.
- [ ] Create the new worktree with `git worktree add <path> -b codex/<slug>`.
- [ ] Register the created worktree through the existing shared tracker logic.
- [ ] Re-run `node --test tests/repo/thread-bootstrap.test.mjs tests/repo/tooling-productivity.test.mjs` until the bootstrap tests pass.

## Chunk 2: Repo Wiring

### Task 3: Expose the command in repo tooling

**Files:**

- Modify: `package.json`

- [ ] Add a `thread:new` package script.
- [ ] Re-run `node --test tests/repo/tooling-productivity.test.mjs`.

### Task 4: Update the guardrails

**Files:**

- Modify: `AGENTS.md`

- [ ] Document that every new independent chat should begin with `thread:new`.
- [ ] Make staying on `main` an explicit opt-in instead of the default.
- [ ] Clarify that `thread:register` tracks an existing worktree and does not create one.

## Chunk 3: Verification

### Task 5: Verify the workflow changes

**Files:**

- Verify: `tests/repo/thread-bootstrap.test.mjs`
- Verify: `tests/repo/tooling-productivity.test.mjs`
- Verify: `tooling/scripts/repo/thread-bootstrap.js`
- Verify: `AGENTS.md`

- [ ] Run `node --test tests/repo/thread-bootstrap.test.mjs tests/repo/tooling-productivity.test.mjs`.
- [ ] Run `npm.cmd run quality:staged`.
- [ ] Run `npm.cmd run thread:new -- --task "smoke test"` manually if the scripted verification stays focused and safe.
