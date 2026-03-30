import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildThreadDevSessionNote,
    getDefaultThreadTask,
} from '../../tooling/scripts/repo/thread-dev-session.js';

test('getDefaultThreadTask prefers linked worktree names over branch names', () => {
    assert.equal(
        getDefaultThreadTask({
            branch: 'codex/library-selection',
            worktreeName: 'codex-library-selection',
        }),
        'codex-library-selection',
    );
});

test('getDefaultThreadTask falls back to branch for main worktree sessions', () => {
    assert.equal(
        getDefaultThreadTask({
            branch: 'main',
            worktreeName: 'main',
        }),
        'main',
    );
});

test('buildThreadDevSessionNote includes script and resolved ports', () => {
    assert.equal(
        buildThreadDevSessionNote({
            script: 'dev:desktop-runtime',
            webPort: 6231,
            backendPort: 6232,
        }),
        'dev:desktop-runtime @ http://localhost:6231 (backend 6232)',
    );
});
