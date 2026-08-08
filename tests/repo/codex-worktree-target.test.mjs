import test from 'node:test';
import assert from 'node:assert/strict';
import { isTaskWorktreeRecordStale, resolveCodexActionWorktree } from '../../tooling/scripts/repo/codex-worktree-target.js';
import { runCodexDebugAction } from '../../tooling/scripts/repo/codex-worktree-debug.js';

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

test('a fresh task worktree at the current main commit remains a valid recorded target', () => {
    const worktreePath = process.cwd();

    assert.equal(isTaskWorktreeRecordStale({
        targetPath: worktreePath,
        entries: [{ worktreePath, status: 'active', includedInMain: true, missing: false }],
        isCurrentMainHead: () => true,
    }), false);
});

test('Codex Debug prints the chosen task runtime URL', () => {
    const worktreePath = process.cwd();
    const output = [];
    const originalLog = console.log;
    console.log = (message) => output.push(message);
    try {
        const result = runCodexDebugAction({
            cwd: worktreePath,
            environment: { CODEX_WORKTREE_PATH: worktreePath },
            runCommand: () => ({ status: 0 }),
        });

        assert.equal(result.targetPath, worktreePath);
        assert.match(output.join('\n'), /Target worktree:/);
        assert.match(output.join('\n'), /Debug URL: http:\/\/localhost:/);
    } finally {
        console.log = originalLog;
    }
});
