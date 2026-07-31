import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildThreadBootstrapSummary,
    buildThreadBootstrapPlan,
    buildThreadTaskCard,
    buildSharedNodeModulesPlan,
    normalizeThreadSlug,
    resolveRepositoryRootFromCommonDir,
    resolvePreferredWorktreeDirectory,
} from '../../tooling/scripts/repo/thread-bootstrap.js';

test('buildThreadTaskCard preserves a high-level objective and criteria', () => {
    assert.deepEqual(
        buildThreadTaskCard({
            objective: 'Make startup failures visible before merging.',
            acceptance: 'Browser boot is checked | Quick loop stays fast',
            phase: 'build',
        }),
        {
            objective: 'Make startup failures visible before merging.',
            acceptanceCriteria: ['Browser boot is checked', 'Quick loop stays fast'],
            deliveryPhase: 'build',
        },
    );
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('normalizeThreadSlug creates a lowercase dash slug', () => {
    assert.equal(normalizeThreadSlug('Automatic Thread Worktrees'), 'automatic-thread-worktrees');
});

test('normalizeThreadSlug removes punctuation and collapses whitespace', () => {
    assert.equal(normalizeThreadSlug('  Ship it? No, isolate it first.  '), 'ship-it-no-isolate-it-first');
});

test('resolvePreferredWorktreeDirectory prefers .worktrees over worktrees', () => {
    assert.equal(
        resolvePreferredWorktreeDirectory({
            availableDirectories: new Set(['.worktrees', 'worktrees']),
            ignoredDirectories: new Set(['.worktrees', 'worktrees']),
        }),
        '.worktrees',
    );
});

test('resolvePreferredWorktreeDirectory rejects project-local directories that are not ignored', () => {
    assert.throws(
        () => resolvePreferredWorktreeDirectory({
            availableDirectories: new Set(['.worktrees']),
            ignoredDirectories: new Set(),
        }),
        /ignored/i,
    );
});

test('buildThreadBootstrapPlan derives branch and worktree path from the task slug', () => {
    assert.deepEqual(
        buildThreadBootstrapPlan({
            task: 'Automatic Thread Worktrees',
            workspaceRoot,
            worktreeDirectory: '.worktrees',
        }),
        {
            task: 'Automatic Thread Worktrees',
            slug: 'automatic-thread-worktrees',
            branch: 'task/automatic-thread-worktrees',
            baseBranch: 'origin/main',
            kind: 'leaf',
            worktreePath: path.join(workspaceRoot, '.worktrees', 'automatic-thread-worktrees'),
        },
    );
});

test('buildThreadBootstrapSummary preserves managed runtime URL output', () => {
    const output = buildThreadBootstrapSummary({
        plan: {
            task: 'Automatic Thread Worktrees',
            branch: 'task/automatic-thread-worktrees',
            worktreePath: path.join(workspaceRoot, '.worktrees', 'automatic-thread-worktrees'),
        },
        linkedSharedNodeModules: true,
        devSessionOutput: [
            'Started dev:desktop-runtime for automatic-thread-worktrees as "Automatic Thread Worktrees".',
            'dev:desktop-runtime @ http://localhost:6231 (backend 6232)',
        ].join('\n'),
    });

    assert.match(output, /Branch: task\/automatic-thread-worktrees/);
    assert.match(output, /Worktree: .*automatic-thread-worktrees/);
    assert.match(output, /http:\/\/localhost:6231 \(backend 6232\)/);
});

test('buildSharedNodeModulesPlan points worktrees at the main workspace dependencies', () => {
    assert.deepEqual(
        buildSharedNodeModulesPlan({
            workspaceRoot,
            worktreePath: path.join(workspaceRoot, '.worktrees', 'automatic-thread-worktrees'),
        }),
        {
            sourceNodeModulesPath: path.join(workspaceRoot, 'node_modules'),
            targetNodeModulesPath: path.join(workspaceRoot, '.worktrees', 'automatic-thread-worktrees', 'node_modules'),
        },
    );
});

test('resolveRepositoryRootFromCommonDir returns the parent of the shared .git directory', () => {
    assert.equal(
        resolveRepositoryRootFromCommonDir(
            path.join(workspaceRoot, '.git', 'worktrees', 'automatic-thread-worktrees'),
        ),
        workspaceRoot,
    );
});
