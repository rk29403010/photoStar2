import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildCombinedThreadNote,
    buildThreadDevSessionNote,
    getDefaultThreadTask,
    shouldStartManagedDevSessionInForeground,
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

test('buildCombinedThreadNote avoids duplicating the same session note', () => {
    assert.equal(
        buildCombinedThreadNote({
            existingNote: 'dev:desktop-runtime @ http://localhost:6231 (backend 6232)',
            providedNote: '',
            sessionNote: 'dev:desktop-runtime @ http://localhost:6231 (backend 6232)',
        }),
        'dev:desktop-runtime @ http://localhost:6231 (backend 6232)',
    );
});

test('foreground dev sessions only attach when explicitly requested from an interactive terminal', () => {
    assert.equal(
        shouldStartManagedDevSessionInForeground({ foreground: true, stdoutIsTTY: true }),
        true,
    );
    assert.equal(
        shouldStartManagedDevSessionInForeground({ foreground: true, stdoutIsTTY: false }),
        false,
    );
    assert.equal(
        shouldStartManagedDevSessionInForeground({ foreground: false, stdoutIsTTY: true }),
        false,
    );
    assert.equal(
        shouldStartManagedDevSessionInForeground({ foreground: true, stdoutIsTTY: false, forceForeground: true }),
        true,
    );
});
