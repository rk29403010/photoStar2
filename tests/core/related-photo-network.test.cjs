const test = require('node:test');
const assert = require('node:assert/strict');
const { processPhotoReconsideration, drainRelatedPhotoQueue } = require('../../dist/core/src/services/relatedPhotos/worker.js');
const { recordEventMembershipDecision } = require('../../dist/core/src/services/relatedPhotos/events.js');
const { fixture, photo, feature, observations, confirmDate, dateClaim, roots, addSet, recordUserTruth, face, candidate, loadAnalysis } = require('./related-photo-network-fixtures.cjs');

function assertDirectRoots(manager, claimId, anchors) {
    const ids = roots(manager, claimId);
    for (const anchor of anchors) { assert.ok(ids.includes(anchor)); }
    for (const id of ids) {
        const claim = manager.getDb().prepare('SELECT kind FROM analysis_claims WHERE id = ?').get(id);
        assert.ok(['known_fact', 'user_confirmed', 'observation'].includes(claim.kind));
    }
}

test('Christmas 1976 inference keeps direct provenance while a false scan neighbor remains possible', t => {
    const { manager, db } = fixture(t);
    photo(manager, 'anchor', 'scan_040.jpg'); observations(manager, 'anchor');
    photo(manager, 'matching', 'scan_041.jpg'); observations(manager, 'matching');
    photo(manager, 'false-neighbor', 'scan_042.jpg');
    observations(manager, 'false-neighbor', [feature('season', 'winter'), feature('decoration', 'Christmas tree')]);
    const root = confirmDate(manager, 'anchor');
    const result = processPhotoReconsideration(manager, 'anchor', 'verified-date');
    const inferred = dateClaim(manager, 'matching');
    assert.equal(inferred.value.label, 'Christmas 1976');
    assert.equal(inferred.kind, 'inferred_conclusion');
    assert.equal(inferred.confidence, 'high');
    assertDirectRoots(manager, inferred.id, [root.id]);
    assert.ok(inferred.evidence.length && inferred.sourceIds.length);
    assert.equal(dateClaim(manager, 'false-neighbor'), undefined);
    assert.equal(db.prepare("SELECT role FROM photo_event_members WHERE asset_id = 'false-neighbor'").get().role, 'possible');
    assert.ok(result.impacts.some(impact => impact.assetId === 'matching' && impact.kind === 'discovery' && impact.field === 'date'));
});

test('A to B to C does not promote propagated B metadata into an independent root for C', t => {
    const { manager } = fixture(t);
    for (const id of ['a', 'b', 'c']) { photo(manager, id); }
    const left = [feature('scene', 'Hall with red velvet curtains'), feature('clothing', 'Plaid blue coat')];
    const right = [feature('building', 'Church entrance with carved stone lion'), feature('vehicle', 'Cream van with striped roof')];
    observations(manager, 'a', left); observations(manager, 'b', [...left, ...right]); observations(manager, 'c', right);
    const root = confirmDate(manager, 'a');
    processPhotoReconsideration(manager, 'a', 'anchor');
    assertDirectRoots(manager, dateClaim(manager, 'b').id, [root.id]);
    processPhotoReconsideration(manager, 'c', 'neighbor-arrived');
    assert.equal(dateClaim(manager, 'c'), undefined);
});

test('correcting and removing a direct anchor invalidates dependent metadata before background recomputation', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching']);
    const original = confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'first-date');
    const corrected = confirmDate(manager, 'anchor', 1977);
    assert.equal(dateClaim(manager, 'matching'), undefined);
    assert.equal(db.prepare('SELECT state FROM analysis_claims WHERE id = ?').get(original.id).state, 'superseded');
    processPhotoReconsideration(manager, 'anchor', 'corrected-date');
    assert.equal(dateClaim(manager, 'matching').value.label, 'Christmas 1977');
    assertDirectRoots(manager, dateClaim(manager, 'matching').id, [corrected.id]);
    recordUserTruth(manager, { assetId: 'anchor', field: 'date', value: null, userId: 'fixture-reviewer', note: 'Date withdrawn' });
    assert.equal(dateClaim(manager, 'matching'), undefined);
    processPhotoReconsideration(manager, 'anchor', 'withdrawn-date');
    assert.equal(dateClaim(manager, 'matching'), undefined);
});

test('incompatible reliable anchors preserve conflict and select no inferred date', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor-a', 'anchor-b', 'unlabelled']);
    const a = confirmDate(manager, 'anchor-a', 1976);
    const b = confirmDate(manager, 'anchor-b', 1977);
    processPhotoReconsideration(manager, 'anchor-a', 'conflicting-dates');
    const inferred = dateClaim(manager, 'unlabelled');
    assert.equal(inferred.value, null);
    assert.equal(inferred.confidence, 'unknown');
    assert.ok(inferred.contradictions.length);
    assertDirectRoots(manager, inferred.id, [a.id, b.id]);
    assert.equal(db.prepare('SELECT state FROM photo_events').get().state, 'conflicted');
    assert.equal(dateClaim(manager, 'anchor-a').id, a.id);
    assert.equal(dateClaim(manager, 'anchor-b').id, b.id);
});

test('removing visual support weakens membership and removes propagated metadata', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'date');
    assert.ok(dateClaim(manager, 'matching'));
    db.prepare("UPDATE analysis_claims SET state = 'rejected' WHERE asset_id = 'anchor' AND field = 'link_features'").run();
    assert.equal(dateClaim(manager, 'matching'), undefined);
    processPhotoReconsideration(manager, 'anchor', 'visual-evidence-removed');
    assert.equal(dateClaim(manager, 'matching'), undefined);
    assert.equal(db.prepare("SELECT role FROM photo_event_members WHERE asset_id = 'matching'").get().role, 'possible');
});

test('rejecting a membership withdraws dependent date immediately and retains the human decision', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'date');
    const eventId = db.prepare('SELECT id FROM photo_events').get().id;
    recordEventMembershipDecision(manager, { eventId, assetId: 'matching', disposition: 'rejected', userId: 'fixture-reviewer' });
    assert.equal(dateClaim(manager, 'matching'), undefined);
    processPhotoReconsideration(manager, 'anchor', 'membership-rejected');
    assert.equal(dateClaim(manager, 'matching'), undefined);
    assert.equal(db.prepare("SELECT state FROM photo_event_members WHERE asset_id = 'matching'").get().state, 'rejected');
    assert.equal(db.prepare('SELECT disposition FROM photo_event_decisions').get().disposition, 'rejected');
});

test('queue drains bounded batches and unchanged reconsideration creates no duplicate impacts or claims', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching', 'other']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'date');
    const beforeImpacts = db.prepare('SELECT COUNT(*) AS count FROM archive_impacts').get().count;
    const beforeRuns = db.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE provider = 'related-photo-network'").get().count;
    const queued = db.prepare("SELECT COUNT(*) AS count FROM related_photo_queue WHERE status = 'pending'").get().count;
    assert.ok(queued >= 3);
    assert.equal(drainRelatedPhotoQueue(manager, 1), 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM related_photo_queue WHERE status = 'pending'").get().count, queued - 1);
    processPhotoReconsideration(manager, 'anchor', 'unchanged-rerun');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM archive_impacts').get().count, beforeImpacts);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE provider = 'related-photo-network'").get().count, beforeRuns);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM related_photo_queue WHERE status = 'failed'").get().count, 0);
    assert.throws(() => drainRelatedPhotoQueue(manager, 21), /batch/);
});

test('confirmed person supports an existing related Face candidate without changing vector score or identity authority', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching']);
    const anchorFace = face(manager, 'anchor');
    const matchingFace = face(manager, 'matching');
    db.prepare("INSERT INTO people(id,name,lifecycle_status) VALUES ('fixture-person','Fixture person','confirmed')").run();
    candidate(manager, matchingFace, anchorFace, 'fixture-person');
    confirmDate(manager, 'anchor');
    const identity = recordUserTruth(manager, { assetId: 'anchor', field: 'identity', subjectId: anchorFace,
        value: { personId: 'fixture-person' }, userId: 'fixture-reviewer' }).claim;
    processPhotoReconsideration(manager, 'anchor', 'person-confirmed');
    const corroboration = db.prepare('SELECT confidence,root_claim_ids_json FROM related_face_candidates WHERE face_id = ?').get(matchingFace);
    assert.equal(corroboration.confidence, 'medium');
    assert.deepEqual(JSON.parse(corroboration.root_claim_ids_json), [identity.id]);
    assert.equal(db.prepare('SELECT raw_cosine FROM face_person_candidates WHERE face_id = ?').get(matchingFace).raw_cosine, 0.82);
    assert.ok(!loadAnalysis(manager, 'matching').winners.some(claim => claim.field === 'identity'));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM semantic_decisions WHERE status = 'accepted'").get().count, 0);
});
