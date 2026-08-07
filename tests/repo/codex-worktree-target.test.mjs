import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveCodexActionWorktree } from '../../tooling/scripts/repo/codex-worktree-target.js';

test('Codex action target prefers the explicit task worktree supplied by the environment', () => {
    const worktreePath = process.cwd();
    const resolvedPath = resolveCodexActionWorktree({
        cwd: worktreePath,
        environment: { CODEX_WORKTREE_PATH: worktreePath },
    });

    assert.equal(resolvedPath, path.resolve(worktreePath));
});

test('Codex action target uses its current dedicated worktree without relying on terminal environment', () => {
    const worktreePath = process.cwd();
    const resolvedPath = resolveCodexActionWorktree({ cwd: worktreePath, environment: {} });

    assert.equal(resolvedPath, path.resolve(worktreePath));
});
