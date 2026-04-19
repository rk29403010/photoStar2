import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    closeThreadEntry,
    createEmptyThreadRegistry,
    getManagedSessionState,
    getWorktreeNameFromPath,
    refreshThreadRegistry,
    renderThreadList,
    upsertThreadEntry,
} from '../../tooling/scripts/repo/thread-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('getWorktreeNameFromPath returns main for the primary workspace', () => {
    assert.equal(getWorktreeNameFromPath(workspaceRoot), 'main');
});

test('getWorktreeNameFromPath returns trailing worktree directory name for linked worktrees', () => {
    assert.equal(
        getWorktreeNameFromPath(path.join(workspaceRoot, '.worktrees', 'codex-library-selection')),
        'codex-library-selection',
    );
});

test('getManagedSessionState ignores stale session pids', () => {
    assert.equal(
        getManagedSessionState({ pid: 12345, lastScript: 'dev:desktop-runtime' }, () => false),
        'none',
    );
    assert.equal(
        getManagedSessionState({ pid: 12345, lastScript: 'dev:desktop-runtime' }, () => true),
        'dev:desktop-runtime',
    );
});

test('upsertThreadEntry inserts a new entry and updates by cwd', () => {
    const registry = createEmptyThreadRegistry();

    upsertThreadEntry(registry, {
        cwd: path.join(workspaceRoot, '.worktrees', 'codex-library-selection'),
        task: 'Library selection',
        status: 'active',
        branch: 'codex/library-selection',
        lastCommit: 'abc1234',
        dirty: true,
        dirtyCount: 3,
        running: 'dev:desktop-runtime',
        worktreeName: 'codex-library-selection',
        worktreePath: path.join(workspaceRoot, '.worktrees', 'codex-library-selection'),
        owner: 'thread-1',
        note: 'Investigating selection model',
        updatedAt: '2026-03-30T10:00:00.000Z',
    });

    upsertThreadEntry(registry, {
        cwd: path.join(workspaceRoot, '.worktrees', 'codex-library-selection'),
        task: 'Library selection',
        status: 'ready-to-merge',
        branch: 'codex/library-selection',
        lastCommit: 'def5678',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-library-selection',
        worktreePath: path.join(workspaceRoot, '.worktrees', 'codex-library-selection'),
        owner: 'thread-1',
        note: 'Ready for merge',
        updatedAt: '2026-03-30T11:00:00.000Z',
    });

    assert.equal(registry.entries.length, 1);
    assert.equal(registry.entries[0].status, 'ready-to-merge');
    assert.equal(registry.entries[0].lastCommit, 'def5678');
    assert.equal(registry.entries[0].dirty, false);
    assert.equal(registry.entries[0].createdAt, '2026-03-30T10:00:00.000Z');
});

test('closeThreadEntry records a closed state and closedAt timestamp', () => {
    const registry = createEmptyThreadRegistry();
    const cwd = path.join(workspaceRoot, '.worktrees', 'codex-library-selection');

    upsertThreadEntry(registry, {
        cwd,
        task: 'Library selection',
        status: 'active',
        branch: 'codex/library-selection',
        lastCommit: 'abc1234',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-library-selection',
        worktreePath: cwd,
        owner: 'thread-1',
        note: '',
        updatedAt: '2026-03-30T10:00:00.000Z',
    });

    closeThreadEntry(registry, cwd, 'merged', '2026-03-30T11:30:00.000Z');

    assert.equal(registry.entries[0].status, 'merged');
    assert.equal(registry.entries[0].closedAt, '2026-03-30T11:30:00.000Z');
    assert.equal(registry.entries[0].running, 'none');
});

test('renderThreadList keeps active threads ahead of closed threads', () => {
    const registry = createEmptyThreadRegistry();

    upsertThreadEntry(registry, {
        cwd: path.join(workspaceRoot, '.worktrees', 'codex-b'),
        task: 'B task',
        status: 'merged',
        branch: 'codex/b',
        lastCommit: 'bbb2222',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-b',
        worktreePath: path.join(workspaceRoot, '.worktrees', 'codex-b'),
        owner: 'thread-b',
        note: '',
        updatedAt: '2026-03-30T10:30:00.000Z',
        closedAt: '2026-03-30T10:30:00.000Z',
    });

    upsertThreadEntry(registry, {
        cwd: path.join(workspaceRoot, '.worktrees', 'codex-a'),
        task: 'A task',
        status: 'active',
        branch: 'codex/a',
        lastCommit: 'aaa1111',
        dirty: true,
        dirtyCount: 2,
        running: 'dev:desktop-runtime',
        worktreeName: 'codex-a',
        worktreePath: path.join(workspaceRoot, '.worktrees', 'codex-a'),
        owner: 'thread-a',
        note: 'In progress',
        updatedAt: '2026-03-30T09:00:00.000Z',
    });

    const output = renderThreadList(registry);

    assert.match(output, /active \| A task \| codex\/a/);
    assert.match(output, /merged \| B task \| codex\/b/);
    assert.ok(output.indexOf('active | A task') < output.indexOf('merged | B task'));
});

test('renderThreadList collapses duplicate note segments for display', () => {
    const registry = createEmptyThreadRegistry();

    upsertThreadEntry(registry, {
        cwd: path.join(workspaceRoot, '.worktrees', 'codex-a'),
        task: 'A task',
        status: 'merged',
        branch: 'codex/a',
        lastCommit: 'aaa1111',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-a',
        worktreePath: path.join(workspaceRoot, '.worktrees', 'codex-a'),
        owner: 'thread-a',
        note: 'dev:desktop-runtime @ http://localhost:6231 (backend 6232) | dev:desktop-runtime @ http://localhost:6231 (backend 6232) | Investigating',
        updatedAt: '2026-03-30T09:00:00.000Z',
    });

    const output = renderThreadList(registry);

    assert.match(output, /note:dev:desktop-runtime @ http:\/\/localhost:6231 \(backend 6232\) \| Investigating/);
    assert.doesNotMatch(output, /note:.*dev:desktop-runtime @ http:\/\/localhost:6231 \(backend 6232\).*dev:desktop-runtime @ http:\/\/localhost:6231 \(backend 6232\).*Investigating/);
});

test('refreshThreadRegistry overlays live snapshots onto registered entries', () => {
    const registry = createEmptyThreadRegistry();
    const cwd = path.join(workspaceRoot, '.worktrees', 'codex-library-selection');

    upsertThreadEntry(registry, {
        cwd,
        task: 'Library selection',
        status: 'active',
        branch: 'codex/library-selection',
        lastCommit: 'abc1234',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-library-selection',
        worktreePath: cwd,
        owner: 'thread-1',
        note: 'Ready',
        updatedAt: '2026-03-30T10:00:00.000Z',
    });

    const refreshed = refreshThreadRegistry(registry, (targetCwd) => ({
        cwd: targetCwd,
        branch: 'codex/library-selection',
        lastCommit: 'def5678',
        dirty: true,
        dirtyCount: 2,
        running: 'dev:desktop-runtime',
        worktreeName: 'codex-library-selection',
        worktreePath: targetCwd,
    }));

    assert.equal(refreshed.entries[0].lastCommit, 'def5678');
    assert.equal(refreshed.entries[0].dirty, true);
    assert.equal(refreshed.entries[0].running, 'dev:desktop-runtime');
    assert.equal(refreshed.entries[0].note, 'Ready');
});

test('refreshThreadRegistry collapses duplicate note segments while preserving order', () => {
    const registry = createEmptyThreadRegistry();
    const cwd = path.join(workspaceRoot, '.worktrees', 'codex-library-selection');

    upsertThreadEntry(registry, {
        cwd,
        task: 'Library selection',
        status: 'active',
        branch: 'codex/library-selection',
        lastCommit: 'abc1234',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-library-selection',
        worktreePath: cwd,
        owner: 'thread-1',
        note: 'dev:desktop-runtime @ http://localhost:6231 (backend 6232) | dev:desktop-runtime @ http://localhost:6231 (backend 6232) | Investigating',
        updatedAt: '2026-03-30T10:00:00.000Z',
    });

    const refreshed = refreshThreadRegistry(registry, (targetCwd) => ({
        cwd: targetCwd,
        branch: 'codex/library-selection',
        lastCommit: 'abc1234',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'codex-library-selection',
        worktreePath: targetCwd,
    }));

    assert.equal(
        refreshed.entries[0].note,
        'dev:desktop-runtime @ http://localhost:6231 (backend 6232) | Investigating',
    );
});
