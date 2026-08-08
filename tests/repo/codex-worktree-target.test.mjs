import test from 'node:test';
import assert from 'node:assert/strict';
import { isTaskWorktreeRecordStale, resolveCodexActionWorktree } from '../../tooling/scripts/repo/codex-worktree-target.js';

test('Codex action target prefers the explicit task worktree supplied by the environment', () => {
    const worktreePath = process.cwd();
    const resolvedPath = resolveCodexActionWorktree({
        cwd: worktreePath,
        environment: { CODEX_WORKTREE_PATH: worktreePath },
    });

    assert.equal(resolvedPath, worktreePath);
});

test('a merged recorded task worktree is stale even when its worktree remains on disk', () => {
    const worktreePath = process.cwd();

    assert.equal(isTaskWorktreeRecordStale({
        targetPath: worktreePath,
        entries: [{ worktreePath, status: 'active', includedInMain: true, missing: false }],
    }), true);
});
