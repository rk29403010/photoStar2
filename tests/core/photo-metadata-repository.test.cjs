const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, loadAnalysis } = require('./photo-analysis-fixtures.cjs');
const { persistFailedAnalysisRun } = require('../../dist/core/src/services/photoAnalysis/repository.js');

test('clean schema creates relational evidence and read views without old metadata tables', t => {
    const { db, manager } = setup(t);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name IN ('photo_metadata_blocks','photo_metadata_assertions','photo_metadata_projection')").get().count, 0);
    add(manager, { field: 'caption', value: 'People standing outside' });
    assert.equal(db.prepare('SELECT caption FROM photo_analysis_display').get().caption, 'People standing outside');
    assert.throws(() => db.prepare("UPDATE photo_analysis_display SET caption='not writable'").run(), /view/);
    assert.equal(loadAnalysis(manager, 'asset-1').sources.length, 1);
});

test('failed runs retain telemetry but do not produce claims or erase current winners', t => {
    const { manager } = setup(t);
    const winner = add(manager, { field: 'caption', value: 'An existing caption' });
    persistFailedAnalysisRun(manager, { assetId: 'asset-1', stage: 'refine', provider: 'google',
        modelVersion: 'configured-model', promptVersion: 'refine-1',
        telemetry: { retries: 2, latencyMs: 5000, inputTokens: 97, error: 'Provider unavailable' },
        targets: [{ field: 'caption', subjectId: null, question: 'Improve wording?', concern: 'contradiction' }] });
    const after = loadAnalysis(manager, 'asset-1');
    assert.equal(after.claims.length, 1);
    assert.equal(after.winners[0].id, winner.id);
    assert.equal(after.runs[1].status, 'failed');
    assert.equal(after.runs[1].telemetry.retries, 2);
});
