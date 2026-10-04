const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
const { fixture, photo, confirmDate, roots, face } = require('./related-photo-network-fixtures.cjs');

function setup(t, memberConfidence = 'high') {
    const { manager, db } = fixture(t);
    for (const id of ['a', 'b', 'c']) { photo(manager, id); }
    const root = confirmDate(manager, 'a');
    db.prepare(`INSERT INTO photo_events(id,seed_asset_id,state,confidence,created_at,updated_at)
        VALUES ('fixture-event','a','supported','high','2026-01-01','2026-01-01')`).run();
    for (const id of ['a', 'b', 'c']) {
        let role = memberConfidence === 'high' ? 'strong' : 'possible';
        if (id === 'a') { role = 'anchored'; }
        db.prepare(`INSERT INTO photo_event_members(event_id,asset_id,role,confidence,state,evidence_json,revision)
            VALUES ('fixture-event', ?, ?, ?, 'active', '[]', 1)`)
            .run(id, role, id === 'a' ? 'high' : memberConfidence);
    }
    return { manager, db, root };
}

function source(assetId, rootIds, members = []) {
    return { id: `source:${randomUUID()}`, assetId, kind: 'related_photo', refId: 'fixture-event',
        text: 'Related evidence from supplied direct roots', rootClaimIds: rootIds,
        memberships: members.map(member => ({ eventId: 'fixture-event', assetId: member, revision: 1 })) };
}

function persist(manager, assetId, options) {
    const { sources = [], sourceIds = sources.map(item => item.id), confidence = 'high', stage = 'context', kind = 'inferred_conclusion' } = options;
    const runId = persistAnalysisRun(manager, { assetId, stage, provider: 'lineage-fixture', modelVersion: null,
        promptVersion: 'fixture-1', sources, result: { claims: [{ field: 'date', subjectId: null,
            value: { start: '1976-12-25', end: '1976-12-25', label: 'Christmas 1976' }, confidence, kind,
            evidence: [], contradictions: [], sourceIds, supersedesId: null }], regions: [], refinementOpportunities: [] } });
    return loadAnalysis(manager, assetId).claims.find(claim => claim.runId === runId);
}

test('weak event membership cannot be upgraded by a high-confidence contextual claim', t => {
    const { manager, root } = setup(t, 'low');
    assert.throws(() => persist(manager, 'b', { sources: [source('b', [root.id], ['a', 'b'])], confidence: 'high' }), /confidence|membership/i);
    const weak = persist(manager, 'b', { sources: [source('b', [root.id], ['a', 'b'])], confidence: 'low' });
    assert.equal(weak.confidence, 'low');
});

test('reusing an already-stored contextual source after its membership revision changes is rejected', t => {
    const { manager, db, root } = setup(t);
    const input = source('b', [root.id], ['a', 'b']);
    const previous = persist(manager, 'b', { sources: [input] });
    db.prepare("UPDATE photo_event_members SET revision = revision + 1 WHERE asset_id = 'b'").run();
    assert.ok(!loadAnalysis(manager, 'b').winners.some(claim => claim.id === previous.id));
    assert.throws(() => persist(manager, 'b', { sources: [], sourceIds: [input.id] }), /membership|changed|stale/i);
});

test('contextual root references cannot become local known facts or user-confirmed authority', t => {
    const { manager, root } = setup(t);
    assert.throws(() => persist(manager, 'b', { sources: [source('b', [root.id], ['b'])], stage: 'local', kind: 'known_fact' }), /authoritative|contextual/i);
    assert.throws(() => persist(manager, 'b', { sources: [source('b', [root.id], ['b'])], stage: 'user', kind: 'user_confirmed' }), /authoritative|contextual/i);
    assert.ok(!loadAnalysis(manager, 'b').winners.length);
});

test('A and its B-derived copy deduplicate to one original root and correction invalidates every dependent', t => {
    const { manager, root } = setup(t);
    const b = persist(manager, 'b', { sources: [source('b', [root.id], ['a', 'b'])] });
    const c = persist(manager, 'c', { sources: [source('c', [root.id], ['a', 'c']), source('c', [b.id], ['b', 'c'])] });
    assert.deepEqual(roots(manager, b.id), [root.id]);
    assert.deepEqual(roots(manager, c.id), [root.id]);
    assert.equal(manager.getDb().prepare('SELECT COUNT(*) AS count FROM analysis_claim_roots WHERE claim_id = ?').get(c.id).count, 1);
    confirmDate(manager, 'a', 1977);
    assert.ok(!loadAnalysis(manager, 'b').winners.some(claim => claim.id === b.id));
    assert.ok(!loadAnalysis(manager, 'c').winners.some(claim => claim.id === c.id));
});

test('reusing a stored source after its root is superseded is rejected without partial run writes', t => {
    const { manager, db, root } = setup(t);
    const input = source('b', [root.id], ['a', 'b']);
    persist(manager, 'b', { sources: [input] });
    confirmDate(manager, 'a', 1977);
    const before = db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count;
    assert.throws(() => persist(manager, 'b', { sourceIds: [input.id] }), /withdrawn|invalid|current/i);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count, before);
});

function persistVisualObservation(manager, assetId, faceId, field, sources, sourceIds) {
    return persistAnalysisRun(manager, { assetId, stage: 'context', provider: 'lineage-fixture', modelVersion: null,
        promptVersion: 'fixture-1', sources, result: { claims: [{ field,
            subjectId: field === 'appearance' ? faceId : null,
            value: field === 'appearance'
                ? { apparentAge: { min: 35, max: 40 }, presentation: null, expression: null, clothing: null }
                : [{ kind: 'clothing', key: 'inferred-age-uniform', label: 'Uniform inferred from family age', confidence: 'medium' }],
            confidence: 'medium', kind: 'observation', evidence: [], contradictions: [], sourceIds, supersedesId: null }],
            regions: [], refinementOpportunities: [] } });
}

test('reused family-context claims cannot masquerade as independent visual ages or link observations', t => {
    const { manager, db } = fixture(t);
    photo(manager, 'target');
    const faceId = face(manager, 'target');
    const familySource = { id: 'family-source', assetId: 'target', kind: 'person', refId: 'recorded-family-person',
        text: 'Recorded family date context' };
    const original = persist(manager, 'target', { sources: [familySource], confidence: 'medium' });
    const storedClaimSource = { id: 'stored-claim-source', assetId: 'target', kind: 'claim', refId: original.id,
        text: 'Previously inferred date from recorded family context' };
    const copy = persist(manager, 'target', { sources: [storedClaimSource], confidence: 'medium' });
    assert.deepEqual(roots(manager, copy.id), [original.id]);
    const before = db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count;
    for (const field of ['appearance', 'link_features']) {
        const freshClaimSource = { ...storedClaimSource, id: `fresh-source-${field}`, refId: copy.id };
        assert.throws(() => persistVisualObservation(manager, 'target', faceId, field,
            [freshClaimSource], [freshClaimSource.id]), /independent.*context/i);
        assert.throws(() => persistVisualObservation(manager, 'target', faceId, field,
            [], [storedClaimSource.id]), /independent.*context/i);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count, before);
});
