import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { selectQueueAdvancement } from '../../tooling/scripts/repo/advance-merge-queue.mjs';
import { classifyOverlap } from '../../tooling/scripts/repo/thread-state.js';

test('queue advancement only updates clean explicitly published main PRs', () => {
    const common = { baseRefName: 'main', headRefOid: 'abc', isDraft: false, labels: ['repository-merge-queued'] };
    assert.equal(selectQueueAdvancement({ ...common, mergeable: 'MERGEABLE' }), 'update-clean');
    assert.equal(selectQueueAdvancement({ ...common, mergeable: 'CONFLICTING' }), 'conflicting-source');
    assert.equal(selectQueueAdvancement({ ...common, mergeable: 'UNKNOWN' }), 'not-clean');
    assert.equal(selectQueueAdvancement({ ...common, baseRefName: 'integration/photo-tools', mergeable: 'MERGEABLE' }), 'not-published-queue');
});

test('overlap reporting recognizes integration coordination', () => {
    const report = classifyOverlap({
        left: { task: 'leaf-a', integrationTaskId: 'editor' }, right: { task: 'leaf-b', integrationTaskId: 'editor' },
        leftPaths: ['src/registry.generated.ts', 'src/host.ts'], rightPaths: ['src/registry.generated.ts', 'src/host.ts'],
    });
    assert.deepEqual(report.sharedPaths, ['src/host.ts', 'src/registry.generated.ts']);
    assert.equal(report.sameIntegrationParent, true);
    assert.equal(report.recommendedAction, 'coordinate through integration');
});

test('disposable repository derives leaf base and publication target from integration state', () => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), 'photostar-integration-fixture-'));
    const script = path.resolve('tooling/scripts/repo/thread-bootstrap.js');
    const git = (args) => execFileSync('git.exe', args, { cwd: fixture, encoding: 'utf8' });
    const node = (args) => execFileSync(process.execPath, args, { cwd: fixture, encoding: 'utf8' });
    try {
        mkdirSync(path.join(fixture, '.worktrees'));
        writeFileSync(path.join(fixture, '.gitignore'), '.worktrees\n');
        writeFileSync(path.join(fixture, 'README.md'), 'fixture\n');
        git(['init', '--initial-branch=main']);
        git(['config', 'user.email', 'fixture@example.test']);
        git(['config', 'user.name', 'Fixture']);
        git(['add', '.']); git(['commit', '-m', 'fixture']);
        node([script, '--task', 'editor integration', '--kind', 'integration']);
        node([script, '--task', 'editor leaf one', '--integration', 'editor integration']);
        const registry = JSON.parse(readFileSync(path.join(fixture, '.git', 'codex-thread-state.json'), 'utf8'));
        const integration = registry.entries.find((entry) => entry.task === 'editor integration');
        const leaf = registry.entries.find((entry) => entry.task === 'editor leaf one');
        assert.equal(integration.kind, 'integration');
        assert.equal(integration.publicationTarget, 'main');
        assert.equal(leaf.kind, 'leaf');
        assert.equal(leaf.integrationTaskId, 'editor integration');
        assert.equal(leaf.intendedBaseBranch, integration.branch);
        assert.equal(leaf.publicationTarget, integration.branch);
    } finally {rmSync(fixture, { recursive: true, force: true });}
});
