const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { persistAnalysisRun } = require('../../dist/core/src/services/photoAnalysis/repository.js');
const { captureArchiveState, recordArchiveImpacts } = require('../../dist/core/src/services/relatedPhotos/impacts.js');
const { processPhotoReconsideration } = require('../../dist/core/src/services/relatedPhotos/worker.js');
const { reconsiderRefinementOpportunities } = require('../../dist/core/src/services/relatedPhotos/opportunities.js');
const { fixture, photo, observations, feature, addSet, confirmDate, recordUserTruth, dateClaim, loadAnalysis } = require('./related-photo-network-fixtures.cjs');

function visualClaim(manager, assetId, field, value, confidence = 'high', previousId = null) {
    const sourceId = `image:${randomUUID()}`;
    const runId = persistAnalysisRun(manager, { assetId, stage: 'scout', provider: 'test-fixture', modelVersion: null,
        promptVersion: 'fixture-impact-1', sources: [{ id: sourceId, assetId, kind: 'image', refId: assetId, text: 'Independent image assessment' }],
        result: { claims: [{ field, subjectId: null, value, confidence, kind: 'observation',
            evidence: [], contradictions: [], sourceIds: [sourceId], supersedesId: previousId }], regions: [], refinementOpportunities: [] } });
    return loadAnalysis(manager, assetId).claims.find(claim => claim.runId === runId);
}

function quality(technical = 'good', assessmentConfidence = 'high') {
    return { technical, composition: 'good', engagement: 'good', historicalInterest: 'high', familyInterest: 'high',
        enhancementPotential: 'low', assessmentConfidence, enhancementRisk: 'low' };
}

function confirmLocation(manager, assetId) {
    return recordUserTruth(manager, { assetId, field: 'location', userId: 'fixture-reviewer',
        value: { label: 'Fixture Hall', country: null, locality: null } }).claim;
}

function resolveUncertainDateQuestion(manager, assetId) {
    const sourceId = `image:${randomUUID()}`;
    persistAnalysisRun(manager, { assetId, stage: 'refine', provider: 'test-fixture', modelVersion: null,
        promptVersion: 'fixture-impact-1', sources: [{ id: sourceId, assetId, kind: 'image', refId: assetId, text: 'Targeted review found no reliable date' }],
        targets: [{ field: 'date', subjectId: null, concern: 'date', question: 'Can the event evidence reliably date this print?' }],
        result: { claims: [{ field: 'date', subjectId: null, value: null, confidence: 'unknown', kind: 'inferred_conclusion',
            evidence: [], contradictions: [], sourceIds: [sourceId], supersedesId: null }], regions: [], refinementOpportunities: [] } });
}

test('genuine quality date and location transitions produce one Ready progress event only when all dimensions are ready', t => {
    const { manager, db } = fixture(t);
    photo(manager, 'target');
    const initial = captureArchiveState(manager, 'target');
    assert.equal(initial.ready, false);
    visualClaim(manager, 'target', 'quality', quality());
    confirmDate(manager, 'target');
    assert.equal(captureArchiveState(manager, 'target').ready, false);
    const first = recordArchiveImpacts(manager, 'target', 'quality-and-date', initial);
    assert.ok(first.some(impact => impact.field === 'quality'));
    assert.ok(first.some(impact => impact.field === 'date'));
    assert.ok(!first.some(impact => impact.field === 'ready' && impact.after === true));
    const beforeLocation = captureArchiveState(manager, 'target');
    confirmLocation(manager, 'target');
    assert.equal(captureArchiveState(manager, 'target').ready, true);
    const second = recordArchiveImpacts(manager, 'target', 'confirmed-place', beforeLocation);
    assert.ok(second.some(impact => impact.field === 'location' && impact.kind === 'discovery'));
    assert.deepEqual(second.filter(impact => impact.field === 'ready').map(({ kind, before, after }) => ({ kind, before, after })),
        [{ kind: 'progress', before: false, after: true }]);
    const ledger = db.prepare('SELECT * FROM archive_impacts ORDER BY rowid').all();
    assert.deepEqual(recordArchiveImpacts(manager, 'target', 'unchanged', captureArchiveState(manager, 'target')), []);
    assert.deepEqual(db.prepare('SELECT * FROM archive_impacts ORDER BY rowid').all(), ledger);
});

test('high-confidence unknown date or location placeholders do not manufacture Ready progress', t => {
    const { manager } = fixture(t);
    for (const field of ['date', 'location']) {
        const assetId = `unknown-${field}`;
        photo(manager, assetId);
        visualClaim(manager, assetId, 'quality', quality());
        if (field === 'date') { confirmLocation(manager, assetId); }
        else { confirmDate(manager, assetId); }
        const before = captureArchiveState(manager, assetId);
        const value = field === 'date' ? { start: null, end: null, label: 'Unknown' }
            : { label: 'Unknown location', country: null, locality: null };
        visualClaim(manager, assetId, field, value);
        const after = captureArchiveState(manager, assetId);
        assert.equal(after.metadataReady, false, `${field} placeholder is not resolved metadata`);
        assert.equal(after.ready, false, `${field} placeholder does not make the photo Ready`);
        const impacts = recordArchiveImpacts(manager, assetId, 'unknown-placeholder', before);
        assert.ok(!impacts.some(impact => ['ready', 'metadataReady'].includes(impact.field) && impact.kind === 'progress'));
    }
});

test('meaningful approximate date labels and valid date bounds remain resolved without requiring an exact date', t => {
    const { manager } = fixture(t);
    const dates = [{ start: null, end: null, label: 'Christmas 1976' },
        { start: '1976-12-25', end: '1976-12-25', label: 'Unknown' }];
    for (const [index, value] of dates.entries()) {
        const assetId = `dated-${index}`;
        photo(manager, assetId);
        visualClaim(manager, assetId, 'quality', quality());
        confirmLocation(manager, assetId);
        visualClaim(manager, assetId, 'date', value, 'medium');
        assert.equal(captureArchiveState(manager, assetId).ready, true);
    }
});

test('reduced confidence or withdrawn metadata is an opportunity, never reported as progress', t => {
    const { manager } = fixture(t);
    photo(manager, 'target');
    const value = { start: '1976-12-25', end: '1976-12-25', label: 'Christmas 1976' };
    const original = visualClaim(manager, 'target', 'date', value);
    const before = captureArchiveState(manager, 'target');
    visualClaim(manager, 'target', 'date', value, 'low', original.id);
    const weakened = recordArchiveImpacts(manager, 'target', 'weaker-evidence', before);
    assert.deepEqual(weakened.filter(impact => impact.field === 'date').map(impact => impact.kind), ['opportunity']);
    const beforeWithdrawal = captureArchiveState(manager, 'target');
    recordUserTruth(manager, { assetId: 'target', field: 'date', value: null, userId: 'fixture-reviewer' });
    const withdrawn = recordArchiveImpacts(manager, 'target', 'date-withdrawn', beforeWithdrawal);
    assert.deepEqual(withdrawn.filter(impact => impact.field === 'date').map(impact => impact.kind), ['opportunity']);
    assert.ok(![...weakened, ...withdrawn].some(impact => impact.kind === 'progress'));
});

test('loss of good appearance records leaving Ready rather than another improvement', t => {
    const { manager } = fixture(t);
    photo(manager, 'target');
    confirmDate(manager, 'target');
    confirmLocation(manager, 'target');
    const original = visualClaim(manager, 'target', 'quality', quality());
    const before = captureArchiveState(manager, 'target');
    assert.equal(before.ready, true);
    visualClaim(manager, 'target', 'quality', quality('poor'), 'high', original.id);
    const impacts = recordArchiveImpacts(manager, 'target', 'new-damage-assessment', before);
    assert.equal(captureArchiveState(manager, 'target').ready, false);
    assert.deepEqual(impacts.filter(impact => impact.field === 'ready').map(({ kind, before: old, after }) => ({ kind, old, after })),
        [{ kind: 'opportunity', old: true, after: false }]);
});

test('an unrelated member revision does not reopen a resolved field question, while new relevant evidence does', t => {
    const { manager, db } = fixture(t);
    for (const id of ['anchor', 'target', 'unrelated']) { photo(manager, id); }
    observations(manager, 'anchor');
    for (const id of ['target', 'unrelated']) { observations(manager, id, [feature('season', 'winter')]); }
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'new-event');
    assert.equal(dateClaim(manager, 'target'), undefined);
    const eventId = db.prepare('SELECT id FROM photo_events').get().id;
    const event = { id: eventId };
    const opportunity = db.prepare("SELECT * FROM related_refinement_opportunities WHERE asset_id = 'target' AND field = 'date'").get();
    assert.equal(opportunity.state, 'pending');
    resolveUncertainDateQuestion(manager, 'target');
    db.prepare("UPDATE photo_event_members SET revision = revision + 1 WHERE asset_id = 'unrelated'").run();
    reconsiderRefinementOpportunities(manager, event);
    const unchanged = db.prepare("SELECT context_key,state FROM related_refinement_opportunities WHERE asset_id = 'target' AND field = 'date'").get();
    assert.equal(unchanged.state, 'resolved');
    assert.equal(unchanged.context_key, opportunity.context_key);
    confirmDate(manager, 'anchor', 1977);
    reconsiderRefinementOpportunities(manager, event);
    const changed = db.prepare("SELECT context_key,state FROM related_refinement_opportunities WHERE asset_id = 'target' AND field = 'date'").get();
    assert.equal(changed.state, 'pending');
    assert.notEqual(changed.context_key, opportunity.context_key);
});

for (const deletion of ['claim', 'asset', 'member']) {
    test(`deleting an authoritative ${deletion} retires dependents before cascaded lineage disappears`, t => {
        const { manager, db } = fixture(t);
        addSet(manager, ['anchor', 'matching']);
        const root = confirmDate(manager, 'anchor');
        processPhotoReconsideration(manager, 'anchor', 'verified-date');
        const inferred = dateClaim(manager, 'matching');
        assert.equal(inferred.value.label, 'Christmas 1976');
        const beforeDeletion = captureArchiveState(manager, 'matching');
        const eventId = db.prepare('SELECT id FROM photo_events').get().id;
        db.prepare('DELETE FROM related_photo_queue').run();
        if (deletion === 'claim') { db.prepare('DELETE FROM analysis_claims WHERE id = ?').run(root.id); }
        if (deletion === 'asset') { db.prepare("DELETE FROM assets WHERE id = 'anchor'").run(); }
        if (deletion === 'member') { db.prepare("DELETE FROM photo_event_members WHERE event_id = ? AND asset_id = 'anchor'").run(eventId); }
        assert.equal(dateClaim(manager, 'matching'), undefined);
        assert.equal(db.prepare('SELECT state FROM analysis_claims WHERE id = ?').get(inferred.id).state, 'superseded');
        assert.equal(db.prepare("SELECT status FROM related_photo_queue WHERE asset_id = 'matching'").get().status, 'pending');
        const losses = recordArchiveImpacts(manager, 'matching', `${deletion}-removed`, beforeDeletion);
        const lostDate = losses.find(impact => impact.field === 'date');
        assert.equal(lostDate.kind, 'opportunity');
        assert.ok(lostDate.rootClaimIds.includes(root.id));
        const foreignKeyViolations = db.pragma('foreign_key_check');
        assert.deepEqual(foreignKeyViolations, []);
        if (deletion !== 'member') {
            assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_claim_roots WHERE root_claim_id = ?').get(root.id).count, 0);
        } else {
            assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analysis_claim_memberships WHERE event_id = ? AND asset_id = 'anchor'").get(eventId).count, 0);
        }
    });
}
