import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getShipCommitMessage,
    getShipIgnorePaths,
    parseGitStatusLines,
    parseWorktreeList,
    resolveMainWorktreePath,
} from '../../tooling/scripts/repo/thread-ship.js';

test('parseWorktreeList extracts worktree records from porcelain output', () => {
    const records = parseWorktreeList([
        'worktree C:/repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree C:/repo/.worktrees/task',
        'HEAD def456',
        'branch refs/heads/codex/task',
        '',
    ].join('\n'));

    assert.deepEqual(records, [
        { worktreePath: 'C:/repo', branchRef: 'refs/heads/main' },
        { worktreePath: 'C:/repo/.worktrees/task', branchRef: 'refs/heads/codex/task' },
    ]);
});

test('resolveMainWorktreePath returns the main checkout path', () => {
    assert.equal(
        resolveMainWorktreePath([
            { worktreePath: 'C:/repo/.worktrees/task', branchRef: 'refs/heads/codex/task' },
            { worktreePath: 'C:/repo', branchRef: 'refs/heads/main' },
        ]),
        'C:/repo',
    );
});

test('parseGitStatusLines ignores generated artifact noise for ship safety checks', () => {
    assert.deepEqual(
        parseGitStatusLines([
            ' M src/app.ts',
            '?? artifacts/output.txt',
            '?? .local/dev-session.json',
        ].join('\n')),
        [{ code: ' M', path: 'src/app.ts' }],
    );
});

test('ship commit message prefers explicit task name', () => {
    assert.equal(
        getShipCommitMessage({ task: 'single photo overlay fixes', branch: 'codex/single-photo-overlay-fixes' }),
        'Finish thread: single photo overlay fixes',
    );
    assert.equal(
        getShipCommitMessage({ task: '', branch: 'codex/single-photo-overlay-fixes' }),
        'Finish branch: codex/single-photo-overlay-fixes',
    );
});

test('ship ignore paths include generated artifacts', () => {
    assert.deepEqual(getShipIgnorePaths(), ['artifacts', '.local']);
});
