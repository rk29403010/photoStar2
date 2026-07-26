import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('task status safely formats absent and malformed failure packets', async () => {
    const lifecycle = await import('../../tooling/scripts/repo/task-status.js');
    const entry = { publishedHead: 'head', latestFailure: {}, prNumber: null };
    assert.equal(lifecycle.getFailure(entry, { statusCheckRollup: [undefined, { conclusion: null }] }), undefined);
    assert.equal(lifecycle.classify(entry, { statusCheckRollup: [undefined, { conclusion: 'ERROR' }], headRefOid: 'head' }), 'FAILED');
    for (const malformedChecks of [undefined, null, {}, 'not-an-array']) {
        assert.deepEqual(lifecycle.checksFrom({ statusCheckRollup: malformedChecks }), []);
        assert.doesNotThrow(() => lifecycle.classify(entry, { statusCheckRollup: malformedChecks, headRefOid: 'head' }));
        assert.equal(lifecycle.getFailure(entry, { statusCheckRollup: malformedChecks }), undefined);
    }
    assert.match(lifecycle.getDetail('FAILED', entry, undefined), /stored task failure packet/);
});

test('task status does not treat two absent commit references as a failure packet', async () => {
    const lifecycle = await import('../../tooling/scripts/repo/task-status.js');
    assert.equal(lifecycle.classify({}, null), 'ACTION NEEDED');
    assert.equal(lifecycle.getFailure({}, null), undefined);
});

test('task finish preserves a new failure packet when registry state is refreshed', async () => {
    const { mergeEntryForSave, refreshedEntryOrFallback } = await import('../../tooling/scripts/repo/task-finish.js');
    const stored = { cwd: 'C:/task', latestFailure: { message: 'old failure' }, commandRuns: [] };
    const updated = { cwd: 'C:/task', latestFailure: { message: 'original command failure' }, commandRuns: [{ state: 'failed' }] };
    assert.equal(mergeEntryForSave(updated, stored).latestFailure.message, 'original command failure');
    const directory = mkdtempSync(path.join(os.tmpdir(), 'photo-star-lifecycle-'));
    const registryPath = path.join(directory, 'task-registry.json');
    try {
        writeFileSync(registryPath, JSON.stringify({ version: 1, entries: [] }));
        const fallback = { cwd: 'C:/missing-task' };
        assert.equal(refreshedEntryOrFallback(registryPath, fallback.cwd, fallback), fallback);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('lifecycle status vocabulary stays total for incomplete data', async () => {
    const lifecycle = await import('../../tooling/scripts/repo/task-status.js');
    for (const result of ['DONE', 'WAITING ON CI', 'FAILED', 'ACTION NEEDED']) {
        assert.equal(typeof lifecycle.getDetail(result, {}, undefined), 'string');
    }
});
