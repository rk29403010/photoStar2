const test = require('node:test');
const assert = require('node:assert/strict');
const { strengthenEventIdentityCandidates } = require('../../dist/core/src/services/relatedPhotos/identityCandidates.js');
const { reconsiderEventMembership, loadEventMembers } = require('../../dist/core/src/services/relatedPhotos/events.js');
const { retirePerson } = require('../../dist/core/src/services/faces/personLifecycleRepository.js');
const { fixture, addSet, face, candidate, recordUserTruth, loadAnalysis } = require('./related-photo-network-fixtures.cjs');

function identityFixture(t) {
    const state = fixture(t);
    const { manager, db } = state;
    addSet(manager, ['identity-anchor', 'identity-target']);
    const anchorFaceId = face(manager, 'identity-anchor');
    const targetFaceId = face(manager, 'identity-target');
    db.prepare("INSERT INTO people(id,name,lifecycle_status) VALUES ('known-person','Fixture person','confirmed')").run();
    candidate(manager, targetFaceId, anchorFaceId, 'known-person');
    const root = recordUserTruth(manager, { assetId: 'identity-anchor', field: 'identity', subjectId: anchorFaceId,
        value: { personId: 'known-person' }, userId: 'fixture-reviewer' }).claim;
    const event = reconsiderEventMembership(manager, 'identity-anchor');
    strengthenEventIdentityCandidates(manager, event);
    return { ...state, event, root, targetFaceId };
}

test('candidate corroboration retains source and target membership revisions without identity authority', t => {
    const { manager, db, event, root, targetFaceId } = identityFixture(t);
    const corroboration = db.prepare('SELECT * FROM related_face_candidates WHERE face_id = ?').get(targetFaceId);
    assert.equal(corroboration.confidence, 'medium');
    assert.deepEqual(JSON.parse(corroboration.root_claim_ids_json), [root.id]);
    const evidence = JSON.parse(corroboration.evidence_json);
    const members = loadEventMembers(manager, event.id);
    assert.deepEqual(evidence.sources, [{ assetId: 'identity-anchor', revision: members.find(member => member.assetId === 'identity-anchor').revision }]);
    assert.equal(evidence.targetRevision, members.find(member => member.assetId === 'identity-target').revision);
    assert.equal(db.prepare('SELECT raw_cosine FROM face_person_candidates WHERE face_id = ?').get(targetFaceId).raw_cosine, 0.82);
    assert.ok(!loadAnalysis(manager, 'identity-target').winners.some(claim => claim.field === 'identity'));
});

test('retiring a Person removes network corroboration and cannot strengthen a retained vector candidate', t => {
    const { manager, db, event, targetFaceId } = identityFixture(t);
    retirePerson(db, 'known-person');
    strengthenEventIdentityCandidates(manager, event);
    assert.equal(db.prepare('SELECT 1 FROM related_face_candidates WHERE face_id = ?').get(targetFaceId), undefined);
    assert.equal(db.prepare('SELECT raw_cosine FROM face_person_candidates WHERE face_id = ?').get(targetFaceId).raw_cosine, 0.82);
    assert.equal(db.prepare("SELECT lifecycle_status FROM people WHERE id = 'known-person'").get().lifecycle_status, 'retired');
});

test('withdrawing the only identity root removes corroboration without inventing another identity', t => {
    const { manager, db, event, root, targetFaceId } = identityFixture(t);
    db.prepare("UPDATE analysis_claims SET state = 'rejected' WHERE id = ?").run(root.id);
    strengthenEventIdentityCandidates(manager, event);
    assert.equal(db.prepare('SELECT 1 FROM related_face_candidates WHERE face_id = ?').get(targetFaceId), undefined);
    assert.equal(db.prepare('SELECT raw_cosine FROM face_person_candidates WHERE face_id = ?').get(targetFaceId).raw_cosine, 0.82);
    assert.ok(!loadAnalysis(manager, 'identity-target').winners.some(claim => claim.field === 'identity'));
});

test('a missing identity root cannot support an existing vector candidate', t => {
    const { manager, db, event, root, targetFaceId } = identityFixture(t);
    db.prepare('DELETE FROM analysis_claims WHERE id = ?').run(root.id);
    strengthenEventIdentityCandidates(manager, event);
    assert.equal(db.prepare('SELECT 1 FROM related_face_candidates WHERE face_id = ?').get(targetFaceId), undefined);
    assert.equal(db.prepare('SELECT raw_cosine FROM face_person_candidates WHERE face_id = ?').get(targetFaceId).raw_cosine, 0.82);
});
