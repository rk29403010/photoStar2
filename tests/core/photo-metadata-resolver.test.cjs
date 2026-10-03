const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, loadAnalysis } = require('./photo-analysis-fixtures.cjs');
const { buildAnalysisDisplay } = require('../../dist/core/src/services/photoAnalysis/display.js');

test('display SQL and services use identical source precedence and insertion order', t => {
    const { manager, db } = setup(t);
    add(manager, { field: 'caption', value: 'Hypothesis caption' });
    add(manager, { field: 'caption', value: 'An inferred caption', kind: 'inferred_conclusion' });
    add(manager, { field: 'caption', value: 'A newer hypothesis' });
    assert.equal(db.prepare('SELECT caption FROM photo_analysis_display').get().caption, 'An inferred caption');
    add(manager, { field: 'caption', value: 'Local caption', stage: 'local', kind: 'known_fact' });
    const user = add(manager, { field: 'caption', value: 'Confirmed caption', stage: 'user', kind: 'user_confirmed' });
    const display = buildAnalysisDisplay(manager, 'asset-1');
    const row = db.prepare('SELECT * FROM photo_analysis_display').get();
    assert.equal(row.caption, display.projection.caption);
    assert.equal(row.caption_source_id, user.id);
    assert.equal(display.provenance.caption.sourceId, user.id);
    assert.equal(row.caption_source_kind, 'user');
});

test('display leaves unsupported numeric judgement empty and retains structured enhancement safety', t => {
    const { manager } = setup(t);
    const enhancement = { action: 'tonal_recovery', target: { kind: 'whole_image' }, expectedBenefit: 'high',
        confidence: 'high', risk: 'low', reason: 'Visible fading', protectedFaceIds: [], protectedRegionIds: [], generative: false };
    add(manager, { field: 'enhancements', value: [enhancement] });
    const display = buildAnalysisDisplay(manager, 'asset-1');
    assert.equal(display.projection.quality.discard, null);
    assert.equal(display.projection.quality.technical, null);
    assert.deepEqual(display.analysis.enhancementRecommendations, [enhancement]);
    assert.equal(loadAnalysis(manager, 'asset-2').winners.length, 0);
});
