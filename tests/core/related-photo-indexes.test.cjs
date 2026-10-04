const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./related-photo-network-fixtures.cjs');

test('event refresh and reverse source dependencies use indexed searches, not archive-wide scans', t => {
    const { db } = fixture(t);
    const queries = [
        ['DELETE FROM related_face_candidates WHERE event_id = ?', ['event'], 'idx_related_face_event'],
        ['SELECT source_id FROM analysis_source_roots WHERE root_claim_id = ?', ['root'], 'idx_analysis_source_root_dependants'],
        ['SELECT source_id FROM analysis_source_memberships WHERE event_id = ? AND asset_id = ?',
            ['event', 'asset'], 'idx_analysis_source_member_dependants'],
    ];
    for (const [query, bindings, index] of queries) {
        const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...bindings);
        assert.ok(plan.some(row => row.detail.includes('SEARCH') && row.detail.includes(index)), JSON.stringify(plan));
    }
});
