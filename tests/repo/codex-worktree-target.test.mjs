import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexActionWorktree } from '../../tooling/scripts/repo/codex-worktree-target.js';

test('Codex action target prefers the explicit task worktree supplied by the environment', () => {
    const worktreePath = process.cwd();
    const resolvedPath = resolveCodexActionWorktree({
        cwd: worktreePath,
        environment: { CODEX_WORKTREE_PATH: worktreePath },
    });

    assert.equal(resolvedPath, worktreePath);
});
