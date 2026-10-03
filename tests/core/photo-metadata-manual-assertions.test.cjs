const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, loadAnalysis } = require('./photo-analysis-fixtures.cjs');
const { buildAnalysisDisplay } = require('../../dist/core/src/services/photoAnalysis/display.js');

test('user-cleared caption is authoritative null and cannot fall back to another caption', t => {
    const { manager, db } = setup(t);
    add(manager, { field: 'caption', value: 'Earlier AI caption' });
    const truth = add(manager, { field: 'caption', value: null, stage: 'user', kind: 'user_confirmed' });
    add(manager, { field: 'caption', value: 'Later AI caption' });
    assert.equal(buildAnalysisDisplay(manager, 'asset-1').projection.caption, null);
    assert.equal(db.prepare('SELECT caption FROM photo_analysis_display').get().caption, null);
    assert.equal(loadAnalysis(manager, 'asset-1').winners[0].id, truth.id);
});

test('a user correction supersedes prior user truth while retaining its original source', t => {
    const { manager } = setup(t);
    const first = add(manager, { field: 'caption', value: 'Original wording', stage: 'user', kind: 'user_confirmed' });
    const second = add(manager, { field: 'caption', value: 'Corrected wording', stage: 'user', kind: 'user_confirmed', supersedesId: first.id });
    const state = loadAnalysis(manager, 'asset-1');
    assert.equal(state.winners[0].id, second.id);
    assert.equal(state.claims[0].state, 'superseded');
    assert.equal(state.sources.length, 2);
});

test('long-form user description is a standalone confirmed claim', t => {
    const { manager } = setup(t);
    add(manager, { field: 'description', value: 'A user account of the event.', stage: 'user', kind: 'user_confirmed' });
    assert.equal(buildAnalysisDisplay(manager, 'asset-1').projection.description, 'A user account of the event.');
});
