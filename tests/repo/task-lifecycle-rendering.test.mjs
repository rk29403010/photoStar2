import assert from 'node:assert/strict';
import test from 'node:test';

test('task status safely formats absent and malformed failure packets', async () => {
    const lifecycle = await import('../../tooling/scripts/repo/task-status.js');
    const entry = { publishedHead: 'head', latestFailure: {}, prNumber: null };
    assert.equal(lifecycle.getFailure(entry, { statusCheckRollup: [undefined, { conclusion: null }] }), undefined);
    assert.equal(lifecycle.classify(entry, { statusCheckRollup: [undefined, { conclusion: 'ERROR' }], headRefOid: 'head' }), 'FAILED');
    assert.match(lifecycle.getDetail('FAILED', entry, undefined), /stored task failure packet/);
});

test('lifecycle status vocabulary stays total for incomplete data', async () => {
    const lifecycle = await import('../../tooling/scripts/repo/task-status.js');
    for (const result of ['DONE', 'WAITING ON CI', 'FAILED', 'ACTION NEEDED']) {
        assert.equal(typeof lifecycle.getDetail(result, {}, undefined), 'string');
    }
});
