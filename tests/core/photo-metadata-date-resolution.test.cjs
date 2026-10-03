const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add } = require('./photo-analysis-fixtures.cjs');
const { buildAnalysisDisplay } = require('../../dist/core/src/services/photoAnalysis/display.js');

test('date range retains visual uncertainty instead of inventing a representative exact date', t => {
    const { manager, db } = setup(t);
    add(manager, { field: 'date', value: { start: '1920-01-01', end: '1929-12-31', label: '1920s' } });
    const date = buildAnalysisDisplay(manager, 'asset-1').projection.estimatedDate;
    const row = db.prepare('SELECT * FROM photo_analysis_display').get();
    assert.equal(date.most_likely_date, null);
    assert.equal(row.estimated_date_most_likely, null);
    assert.equal(date.display_label, row.estimated_date_display_label);
    assert.equal(date.min_date, row.estimated_date_min);
    assert.equal(date.max_date, row.estimated_date_max);
});

test('confirmed exact date and explicit unknown both remain authoritative', t => {
    const { manager, db } = setup(t);
    const exact = add(manager, { field: 'date', value: { start: '1931-03-02', end: '1931-03-02', label: '2 March 1931' }, stage: 'user', kind: 'user_confirmed' });
    assert.equal(buildAnalysisDisplay(manager, 'asset-1').projection.estimatedDate.most_likely_date, '1931-03-02');
    add(manager, { field: 'date', value: null, stage: 'user', kind: 'user_confirmed', supersedesId: exact.id });
    add(manager, { field: 'date', value: { start: '1940-01-01', end: '1949-12-31', label: '1940s' } });
    assert.equal(buildAnalysisDisplay(manager, 'asset-1').projection.estimatedDate.display_label, null);
    assert.equal(db.prepare('SELECT estimated_date_display_label FROM photo_analysis_display').get().estimated_date_display_label, null);
});
