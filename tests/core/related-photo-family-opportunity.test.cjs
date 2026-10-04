const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture, photo, face, candidate, recordUserTruth, loadAnalysis } = require('./related-photo-network-fixtures.cjs');
const { persistAnalysisRun } = require('../../dist/core/src/services/photoAnalysis/repository.js');
const { buildFamilyIdentityContext, queuePersonPhotoReconsideration } = require('../../dist/core/src/services/relatedPhotos/identityContext.js');
const { processPhotoReconsideration } = require('../../dist/core/src/services/relatedPhotos/worker.js');

function familyFixture(t, confirmed = true) {
    const state = fixture(t); const { manager, db } = state;
    photo(manager, 'photo'); photo(manager, 'other');
    db.prepare('UPDATE assets SET original_path=? WHERE id=?').run('D:\\Other Archive\\other.jpg', 'other');
    const faceId = face(manager, 'photo');
    db.exec("INSERT INTO people(id,name,lifecycle_status) VALUES ('known','Recorded Person','confirmed')");
    candidate(manager, faceId, faceId, 'known');
    if (confirmed) { recordUserTruth(manager, { assetId: 'photo', field: 'identity', subjectId: faceId,
        value: { personId: 'known' }, userId: 'reviewer' }); }
    db.prepare('INSERT INTO family_trees(id,filename,file_hash,gedcom_content,tree_group_id) VALUES (?,?,?,?,?)')
        .run('tree', 'family.ged', 'hash', '0 @I1@ INDI\n1 NAME Recorded /Person/\n1 BIRT\n2 DATE 1940', 'group');
    db.exec("INSERT INTO people_gedcom_links(person_id,gedcom_tree_id,gedcom_person_id) VALUES ('known','tree','@I1@')");
    return { ...state, faceId };
}

function claim(manager, assetId, field, value, options = {}) {
    const id = randomUUID();
    const source = options.source ?? { id, assetId, kind: 'image', refId: assetId, text: 'Independent photo observation' };
    const runId = persistAnalysisRun(manager, { assetId, stage: options.stage ?? 'context', provider: 'fixture',
        modelVersion: null, promptVersion: 'fixture-1', sources: options.reuse ? [] : [source],
        result: { claims: [{ field, value, subjectId: options.subjectId ?? null, kind: options.kind ?? 'inferred_conclusion',
            confidence: options.confidence ?? 'medium', evidence: [], contradictions: [], sourceIds: [source.id], supersedesId: null }],
        regions: [], refinementOpportunities: [] } });
    return loadAnalysis(manager, assetId).claims.find(item => item.runId === runId);
}

const date = { start: '1976-12-25', end: '1976-12-25', label: 'Christmas 1976' };
const age = { apparentAge: { min: 30, max: 40 }, presentation: null, expression: null, clothing: null };

test('family changes immediately withdraw contextual conclusions and real descendants, preserving visual age and user truth', t => {
    const { manager, db, faceId } = familyFixture(t);
    const observed = claim(manager, 'photo', 'appearance', age, { stage: 'scout', kind: 'observation', subjectId: faceId });
    const family = buildFamilyIdentityContext(manager, { assetId: 'photo', faceId })[0];
    const source = { id: 'family-source', assetId: 'photo', kind: 'person', refId: family.sourceId, text: family.text };
    const conclusion = claim(manager, 'photo', 'date', date, { source });
    const descendant = claim(manager, 'other', 'date', date, { confidence: 'low', source: { id: 'dependent-source', assetId: 'other',
        kind: 'related_photo', refId: conclusion.id, text: 'Related conclusion, not an independent root' } });
    const other = claim(manager, 'other', 'caption', 'Independent other photo', { source: { id: 'other-person-context',
        assetId: 'other', kind: 'relationship', refId: 'unrelated-person', text: 'Other unrelated family context' } });
    db.exec('DELETE FROM related_photo_queue');
    queuePersonPhotoReconsideration(manager, 'known', 'family-record-corrected');
    assert.equal(db.prepare("SELECT state FROM analysis_sources WHERE id='family-source'").get().state, 'withdrawn');
    assert.equal(db.prepare('SELECT state FROM analysis_claims WHERE id=?').get(conclusion.id).state, 'superseded');
    assert.ok(!loadAnalysis(manager, 'photo').winners.some(item => item.id === conclusion.id));
    assert.ok(!loadAnalysis(manager, 'other').winners.some(item => item.id === descendant.id));
    assert.ok(loadAnalysis(manager, 'photo').winners.some(item => item.id === observed.id));
    assert.ok(loadAnalysis(manager, 'photo').winners.some(item => item.field === 'identity' && item.kind === 'user_confirmed'));
    assert.ok(loadAnalysis(manager, 'other').winners.some(item => item.id === other.id));
    assert.equal(db.prepare("SELECT state FROM analysis_sources WHERE id='other-person-context'").get().state, 'active');
    assert.deepEqual(db.prepare('SELECT asset_id FROM related_photo_queue ORDER BY asset_id').all().map(row => row.asset_id), ['other', 'photo']);
    assert.throws(() => claim(manager, 'photo', 'date', date, { source, reuse: true }), /withdrawn/);
    const fresh = claim(manager, 'photo', 'date', date, { source: { ...source, id: 'fresh-family-source', text: 'Current corrected family facts' } });
    assert.ok(loadAnalysis(manager, 'photo').winners.some(item => item.id === fresh.id));
});

test('context withdrawal, supersession and refresh queue roll back together', t => {
    const { manager, db } = familyFixture(t);
    const source = { id: 'relationship-source', assetId: 'photo', kind: 'relationship', refId: 'family', text: 'Family relationship context' };
    const conclusion = claim(manager, 'photo', 'date', date, { source });
    db.exec('DELETE FROM related_photo_queue');
    assert.throws(() => db.transaction(() => { queuePersonPhotoReconsideration(manager, 'known', 'change'); throw new Error('rollback'); })(), /rollback/);
    assert.equal(db.prepare("SELECT state FROM analysis_sources WHERE id='relationship-source'").get().state, 'active');
    assert.equal(db.prepare('SELECT state FROM analysis_claims WHERE id=?').get(conclusion.id).state, 'active');
    assert.deepEqual(db.prepare('SELECT asset_id FROM related_photo_queue').all(), []);
});

test('an inferred identity that is the only Person link is queued before its contextual source is superseded', t => {
    const { manager, db, faceId } = familyFixture(t, false);
    const source = { id: 'identity-person-source', assetId: 'photo', kind: 'person', refId: 'known', text: 'Supplied Person candidate' };
    const conclusion = claim(manager, 'photo', 'identity', { personId: 'known' }, { source, subjectId: faceId });
    db.exec('DELETE FROM face_person_candidates; DELETE FROM related_photo_queue');
    assert.equal(queuePersonPhotoReconsideration(manager, 'known', 'person-retired'), 1);
    assert.equal(db.prepare('SELECT state FROM analysis_claims WHERE id=?').get(conclusion.id).state, 'superseded');
    assert.deepEqual(db.prepare('SELECT asset_id FROM related_photo_queue').all(), [{ asset_id: 'photo' }]);
});

test('a linked-family change creates a bounded unresolved identity opportunity even without an event', t => {
    const { manager, db, faceId } = familyFixture(t, false);
    queuePersonPhotoReconsideration(manager, 'known', 'family-linked');
    processPhotoReconsideration(manager, 'photo', 'family-linked');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM photo_events').get().count, 0);
    const pending = db.prepare("SELECT field,subject_id,state FROM related_refinement_opportunities WHERE asset_id='photo'").all();
    assert.deepEqual(pending, [{ field: 'identity', subject_id: faceId, state: 'pending' }]);
    const choices = buildFamilyIdentityContext(manager, { assetId: 'photo', faceId, limit: 1 });
    assert.deepEqual(choices.map(item => item.personId), ['known']);
    assert.match(choices[0].text, /Birth 1940/);
    const ids = db.prepare('SELECT id FROM archive_impacts').all();
    processPhotoReconsideration(manager, 'photo', 'unchanged-family');
    assert.deepEqual(db.prepare('SELECT id FROM archive_impacts').all(), ids);
    recordUserTruth(manager, { assetId: 'photo', field: 'identity', subjectId: faceId, value: { personId: 'known' }, userId: 'reviewer' });
    processPhotoReconsideration(manager, 'photo', 'identity-confirmed');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM related_refinement_opportunities WHERE asset_id='photo' AND state='pending'").get().count, 0);
});
