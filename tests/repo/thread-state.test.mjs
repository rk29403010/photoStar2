import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
    closeThreadEntry,
    buildReconciliationPlan,
    buildAuditReport,
    createEmptyThreadRegistry,
    findThreadEntry,
    getManagedSessionState,
    getWorktreeNameFromPath,
    isBranchMergedIntoTargets,
    refreshThreadRegistry,
    renderAuditReport,
    renderThreadList,
    readThreadRegistry,
    writeThreadRegistry,
    upsertThreadEntry,
} from '../../tooling/scripts/repo/thread-state.js';

test('registry writes are atomic and corrupt registries fail closed', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'photo-star-task-state-'));
    const registryPath = path.join(temporaryDirectory, 'task-state.json');
    try {
        writeThreadRegistry(registryPath, createEmptyThreadRegistry());
        assert.deepEqual(readThreadRegistry(registryPath), createEmptyThreadRegistry());
        writeFileSync(registryPath, '{broken');
        assert.throws(() => readThreadRegistry(registryPath), /registry is corrupt.*Refusing to overwrite/);
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});

test('reconciliation only closes missing tasks whose merge is proven', () => {
    const registry = { version: 1, entries: [
        { cwd: 'C:/gone/merged', task: 'merged', status: 'active', missing: true, includedInMain: true },
        { cwd: 'C:/gone/open', task: 'open', status: 'active', missing: true, includedInMain: false },
    ] };
    assert.deepEqual(buildReconciliationPlan(registry).map((item) => item.action), [
        'cleanup-merged-residue',
        'keep',
    ]);
});

test('reconciliation closes stale dirty metadata when the worktree is already absent', () => {
    const registry = { version: 1, entries: [{
        cwd: 'C:/gone/stale-dirty-record',
        task: 'stale dirty metadata',
        status: 'active',
        missing: true,
        dirty: true,
        includedInMain: true,
    }] };

    assert.equal(buildReconciliationPlan(registry)[0].action, 'cleanup-merged-residue');
});

test('reconciliation removes a clean merged task whose worktree still exists', () => {
    const registry = { version: 1, entries: [{
        cwd: 'C:/residual/merged-task',
        task: 'merged with residue',
        status: 'merged',
        missing: false,
        dirty: false,
        includedInMain: true,
    }] };

    assert.deepEqual(buildReconciliationPlan(registry).map((item) => item.action), [
        'cleanup-merged-residue',
    ]);
});

test('reconciliation removes a merged residual directory after Git metadata is gone', () => {
    const registry = { version: 1, entries: [{
        cwd: 'C:/residual/merged-task',
        task: 'merged residual files',
        status: 'merged',
        missing: true,
        residualPathExists: true,
        dirty: false,
        includedInMain: true,
    }] };

    assert.equal(buildReconciliationPlan(registry)[0].action, 'cleanup-merged-residue');
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');
const worktreeRootMarkers = [
    `${path.sep}.worktrees${path.sep}`,
    `${path.sep}worktrees${path.sep}`,
];
const worktreeRootMarker = worktreeRootMarkers.find((marker) => workspaceRoot.includes(marker));
const primaryWorkspaceRoot = worktreeRootMarker
    ? workspaceRoot.slice(0, workspaceRoot.indexOf(worktreeRootMarker))
    : workspaceRoot;
const exampleBranch = 'codex/example';
const mergedIntoOriginMainResponses = new Map([
    ['rev-parse --verify main', { status: 0, stdout: 'main\n' }],
    [`merge-base --is-ancestor ${exampleBranch} main`, { status: 1, stdout: '' }],
    ['rev-parse --verify origin/main', { status: 0, stdout: 'origin/main\n' }],
    [`merge-base --is-ancestor ${exampleBranch} origin/main`, { status: 0, stdout: '' }],
]);
const mergedNowhereResponses = new Map([
    ['rev-parse --verify main', { status: 0, stdout: 'main\n' }],
    [`merge-base --is-ancestor ${exampleBranch} main`, { status: 1, stdout: '' }],
    ['rev-parse --verify origin/main', { status: 0, stdout: 'origin/main\n' }],
    [`merge-base --is-ancestor ${exampleBranch} origin/main`, { status: 1, stdout: '' }],
]);

function executeGitMergedIntoOriginMain(args) {
    const response = mergedIntoOriginMainResponses.get(args.join(' '));
    if (response) {
        return response;
    }

    throw new Error(`Unexpected git call: ${args.join(' ')}`);
}

function executeGitMergedNowhere(args) {
    const response = mergedNowhereResponses.get(args.join(' '));
    if (response) {
        return response;
    }

    throw new Error(`Unexpected git call: ${args.join(' ')}`);
}

test('getWorktreeNameFromPath returns main for the primary workspace', () => {
    assert.equal(getWorktreeNameFromPath(primaryWorkspaceRoot), 'main');
});

test('getWorktreeNameFromPath returns trailing worktree directory name for linked worktrees', () => {
    assert.equal(
        getWorktreeNameFromPath(path.join(primaryWorkspaceRoot, '.worktrees', 'codex-library-selection')),
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

test('getManagedSessionState safely ignores incomplete or malformed session records', () => {
    assert.equal(getManagedSessionState(null), 'none');
    assert.equal(getManagedSessionState({ lastScript: 'dev:desktop-runtime' }), 'none');
    assert.equal(getManagedSessionState({ pid: 'not-a-pid', lastScript: 'dev:desktop-runtime' }, () => true), 'none');
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

test('findThreadEntry resolves registered threads by task, branch, cwd, or worktree name', () => {
    const registry = createEmptyThreadRegistry();
    const cwd = path.join(workspaceRoot, '.worktrees', 'post-restart-app-smoke-test');

    upsertThreadEntry(registry, {
        cwd,
        task: 'Post Restart App Smoke Test',
        status: 'ready-to-merge',
        branch: 'codex/post-restart-app-smoke-test',
        lastCommit: '23ef6e6',
        dirty: false,
        dirtyCount: 0,
        running: 'none',
        worktreeName: 'post-restart-app-smoke-test',
        worktreePath: cwd,
        owner: '',
        note: '',
        updatedAt: '2026-04-23T10:00:00.000Z',
    });

    assert.equal(findThreadEntry(registry, { task: 'post restart app smoke test' })?.branch, 'codex/post-restart-app-smoke-test');
    assert.equal(findThreadEntry(registry, { branch: 'codex/post-restart-app-smoke-test' })?.task, 'Post Restart App Smoke Test');
    assert.equal(findThreadEntry(registry, { cwd })?.worktreeName, 'post-restart-app-smoke-test');
    assert.equal(findThreadEntry(registry, { worktreeName: 'post-restart-app-smoke-test' })?.lastCommit, '23ef6e6');
});

test('isBranchMergedIntoTargets only reports merged when git proves containment', () => {
    const calls = [];
    const executeGit = (args) => {
        calls.push(args.join(' '));
        return executeGitMergedIntoOriginMain(args);
    };

    assert.equal(
        isBranchMergedIntoTargets(
            {
                branch: exampleBranch,
                cwd: workspaceRoot,
            },
            executeGit,
        ),
        true,
    );
    assert.deepEqual(calls, [
        `rev-parse --verify main`,
        `merge-base --is-ancestor ${exampleBranch} main`,
        `rev-parse --verify origin/main`,
        `merge-base --is-ancestor ${exampleBranch} origin/main`,
    ]);
});

test('isBranchMergedIntoTargets returns false when no tracked target contains the branch', () => {
    assert.equal(
        isBranchMergedIntoTargets(
            {
                branch: exampleBranch,
                cwd: workspaceRoot,
            },
            executeGitMergedNowhere,
        ),
        false,
    );
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

    const output = renderThreadList(registry, { all: true, verbose: true });

    assert.match(output, /"task": "A task"/);
    assert.match(output, /"task": "B task"/);
    assert.ok(output.indexOf('"task": "A task"') < output.indexOf('"task": "B task"'));
});

test('renderThreadList surfaces worktree path and runtime ports', () => {
    const registry = createEmptyThreadRegistry();
    const worktreePath = path.join(workspaceRoot, '.worktrees', 'codex-runtime');

    upsertThreadEntry(registry, {
        cwd: worktreePath,
        task: 'Runtime task',
        status: 'active',
        branch: 'codex/runtime-task',
        lastCommit: 'aaa1111',
        dirty: false,
        dirtyCount: 0,
        running: 'dev:desktop-runtime',
        appUrl: 'http://localhost:6231',
        webPort: 6231,
        backendPort: 6232,
        worktreeName: 'codex-runtime',
        worktreePath,
        owner: '',
        note: '',
        updatedAt: '2026-03-30T09:00:00.000Z',
    });

    const output = renderThreadList(registry, { verbose: true });

    assert.match(output, /"running": "dev:desktop-runtime"/);
    assert.match(output, /"appUrl": "http:\/\/localhost:6231"/);
    assert.match(output, /"backendPort": 6232/);
    assert.equal(JSON.parse(output)[0].worktreePath, worktreePath);
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

    const output = renderThreadList(registry, { all: true, verbose: true });

    assert.match(output, /"note": "dev:desktop-runtime @ http:\/\/localhost:6231 \(backend 6232\) \| Investigating"/);
    assert.doesNotMatch(output, /"note":.*dev:desktop-runtime @ http:\/\/localhost:6231 \(backend 6232\).*dev:desktop-runtime @ http:\/\/localhost:6231 \(backend 6232\).*Investigating/);
});

test('compact list hides closed history while all and JSON retain it', () => {
    const registry = createEmptyThreadRegistry();
    upsertThreadEntry(registry, { cwd: 'C:/task-a', task: 'Active', status: 'active', branch: 'task/a', dirty: false, dirtyCount: 0, running: 'none', ahead: 1, behind: 0, updatedAt: '2026-01-01T00:00:00.000Z' });
    upsertThreadEntry(registry, { cwd: 'C:/task-b', task: 'Merged', status: 'merged', branch: 'task/b', dirty: false, dirtyCount: 0, running: 'none', updatedAt: '2026-01-01T00:00:00.000Z' });
    assert.match(renderThreadList(registry), /STATUS/);
    assert.doesNotMatch(renderThreadList(registry), /Merged/);
    assert.match(renderThreadList(registry, { all: true }), /Merged/);
    assert.equal(JSON.parse(renderThreadList(registry, { all: true, json: true })).length, 2);
});

test('audit reports only actionable unsafe task state', () => {
    const registry = createEmptyThreadRegistry();
    upsertThreadEntry(registry, { cwd: 'C:/dirty', task: 'Dirty', status: 'active', branch: 'task/dirty', dirty: true, dirtyCount: 1, running: 'none', updatedAt: '2026-01-01T00:00:00.000Z' });
    upsertThreadEntry(registry, { cwd: 'C:/merged', task: 'Merged', status: 'merged', branch: 'task/merged', dirty: false, running: 'none', updatedAt: '2026-01-01T00:00:00.000Z' });
    const report = buildAuditReport(registry);
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0].issue, 'dirty active task');
});

test('audit classifies missing worktrees by task lifecycle without duplicate issues', () => {
    const registry = createEmptyThreadRegistry();
    const entries = [
        ['Merged', 'merged', true, true],
        ['Discarded', 'discarded', true, false],
        ['Parked', 'parked', true, false],
        ['Uncontained', 'active', true, false],
        ['Contained', 'active', true, true],
    ];

    for (const [task, status, missing, includedInMain] of entries) {
        upsertThreadEntry(registry, {
            cwd: `C:/${task.toLowerCase()}`,
            task,
            status,
            branch: `task/${task.toLowerCase()}`,
            missing,
            residualPathExists: false,
            includedInMain,
            dirty: false,
            running: 'none',
            updatedAt: '2026-01-01T00:00:00.000Z',
        });
    }

    const report = buildAuditReport(registry);
    assert.deepEqual(report.issues.map((issue) => [issue.task, issue.issue]), [
        ['Uncontained', 'missing active worktree'],
        ['Contained', 'stale integrated task'],
    ]);
    assert.equal(report.issues.filter((issue) => issue.task === 'Contained').length, 1);
    assert.equal(report.entries.length, 5);
});

test('audit renders issue status and keeps healthy closed history behind all or json output', () => {
    const registry = createEmptyThreadRegistry();
    upsertThreadEntry(registry, { cwd: 'C:/closed', task: 'Merged', status: 'merged', branch: 'task/merged', missing: true, residualPathExists: false, dirty: false, running: 'none', updatedAt: '2026-01-01T00:00:00.000Z' });
    upsertThreadEntry(registry, { cwd: 'C:/missing', task: 'Missing', status: 'active', branch: 'task/missing', missing: true, includedInMain: false, dirty: false, running: 'none', updatedAt: '2026-01-01T00:00:00.000Z' });

    const report = buildAuditReport(registry);
    const compactOutput = renderAuditReport(report);
    assert.match(compactOutput, /STATUS\s+TASK\s+BRANCH\s+ISSUE\s+NEXT ACTION/);
    assert.match(compactOutput, /active\s+Missing/);
    assert.doesNotMatch(compactOutput, /Merged/);
    assert.match(renderAuditReport(report, { all: true }), /Merged/);
    assert.equal(JSON.parse(renderAuditReport(report, { json: true })).entries.length, 2);
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
