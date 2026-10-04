const test = require('node:test');
const assert = require('node:assert/strict');
const { reconsiderEventMembership, loadEventMembers, MAX_EVENT_MEMBERS } = require('../../dist/core/src/services/relatedPhotos/events.js');
const { processPhotoReconsideration } = require('../../dist/core/src/services/relatedPhotos/worker.js');
const { propagateEventEvidence } = require('../../dist/core/src/services/relatedPhotos/propagation.js');
const analysisRepository = require('../../dist/core/src/services/photoAnalysis/repository.js');
const candidateRepository = require('../../dist/core/src/services/relatedPhotos/candidates.js');
const { fixture, photo, observations, feature, confirmDate, dateClaim, addSet, recordUserTruth } = require('./related-photo-network-fixtures.cjs');

test('broad date agreement cannot hide incompatible narrow anchors and conflict revisions stay stable', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['broad', 'narrow-a', 'narrow-b', 'unlabelled']);
    recordUserTruth(manager, { assetId: 'broad', field: 'date', userId: 'fixture-reviewer',
        value: { start: '1970-01-01', end: '1980-12-31', label: '1970s' } });
    confirmDate(manager, 'narrow-a', 1976);
    confirmDate(manager, 'narrow-b', 1977);
    processPhotoReconsideration(manager, 'broad', 'conflicting-range');
    assert.equal(dateClaim(manager, 'unlabelled').value, null);
    assert.equal(db.prepare('SELECT state FROM photo_events').get().state, 'conflicted');
    const members = db.prepare('SELECT asset_id,role,revision FROM photo_event_members ORDER BY asset_id').all();
    assert.ok(members.every(member => member.role === 'conflicting'));
    const runs = db.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE provider = 'related-photo-network'").get().count;
    processPhotoReconsideration(manager, 'broad', 'unchanged-conflict');
    assert.deepEqual(db.prepare('SELECT asset_id,role,revision FROM photo_event_members ORDER BY asset_id').all(), members);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE provider = 'related-photo-network'").get().count, runs);
    confirmDate(manager, 'narrow-b', 1976);
    processPhotoReconsideration(manager, 'narrow-b', 'anchor-corrected');
    assert.equal(db.prepare('SELECT state FROM photo_events').get().state, 'supported');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM photo_event_members WHERE role = 'conflicting'").get().count, 0);
    assert.ok(dateClaim(manager, 'unlabelled').value);
});

test('supported event confidence respects medium-confidence independent membership observations', t => {
    const { manager, db } = fixture(t);
    for (const id of ['anchor', 'matching']) {
        photo(manager, id);
        observations(manager, id, [feature('scene', 'Distinct carved fireplace', 'medium'),
            feature('clothing', 'Green jacket with brass buttons', 'medium')]);
    }
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'medium-membership');
    assert.equal(dateClaim(manager, 'matching').confidence, 'medium');
    assert.equal(db.prepare('SELECT confidence FROM photo_events').get().confidence, 'medium');
});

test('an undated seed can receive anchored evidence through independently strong matching neighbours', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['undated-seed', 'dated-neighbour']);
    confirmDate(manager, 'dated-neighbour');
    processPhotoReconsideration(manager, 'undated-seed', 'matched-anchor');
    assert.equal(dateClaim(manager, 'undated-seed').value.label, 'Christmas 1976');
    assert.equal(db.prepare("SELECT role FROM photo_event_members WHERE asset_id = 'undated-seed'").get().role, 'strong');
});

test('rebuilding a discarded machine feature cache retains supported event evidence', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'original-support');
    const before = dateClaim(manager, 'matching');
    const members = db.prepare('SELECT asset_id,role,revision FROM photo_event_members ORDER BY asset_id').all();
    db.prepare('DELETE FROM related_photo_features').run();
    db.prepare('DELETE FROM related_photo_order').run();
    processPhotoReconsideration(manager, 'anchor', 'cache-rebuild');
    assert.equal(dateClaim(manager, 'matching').id, before.id);
    assert.deepEqual(db.prepare('SELECT asset_id,role,revision FROM photo_event_members ORDER BY asset_id').all(), members);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM related_photo_features WHERE asset_id = 'matching'").get().count, 4);
});

test('full events retain all existing members and never admit the sixty-fifth asset', t => {
    const { manager, db } = fixture(t);
    const ids = Array.from({ length: MAX_EVENT_MEMBERS }, (_, index) => `member-${index}`);
    addSet(manager, [...ids, 'newcomer']);
    confirmDate(manager, ids[0]);
    db.prepare("INSERT INTO photo_events(id,seed_asset_id,state,confidence,created_at,updated_at) VALUES ('full',?,'supported','high','fixture','fixture')").run(ids[0]);
    const insert = db.prepare("INSERT INTO photo_event_members(event_id,asset_id,role,confidence,state,evidence_json,revision) VALUES ('full',?,'strong','high','active','[]',1)");
    for (const id of ids) { insert.run(id); }
    const full = reconsiderEventMembership(manager, ids[0]);
    assert.equal(full.id, 'full');
    assert.deepEqual(loadEventMembers(manager, 'full').map(member => member.assetId), [...ids].sort());
    const next = reconsiderEventMembership(manager, 'newcomer');
    assert.notEqual(next.id, 'full');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM photo_event_members WHERE event_id = 'full'").get().count, MAX_EVENT_MEMBERS);
    assert.equal(db.prepare("SELECT 1 FROM photo_event_members WHERE event_id = 'full' AND asset_id = 'newcomer'").get(), undefined);
    assert.ok(loadEventMembers(manager, next.id).length <= MAX_EVENT_MEMBERS);
});

test('binned peers cannot anchor propagation or independently support a seed', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['seed', 'anchor']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'seed', 'linked-anchor');
    assert.ok(dateClaim(manager, 'seed'));
    db.prepare("UPDATE assets SET binned_at = 'fixture-bin-time' WHERE id = 'anchor'").run();
    assert.equal(dateClaim(manager, 'seed'), undefined);
    processPhotoReconsideration(manager, 'seed', 'anchor-binned');
    assert.equal(dateClaim(manager, 'seed'), undefined);
    assert.equal(db.prepare("SELECT state FROM photo_event_members WHERE asset_id = 'anchor'").get().state, 'withdrawn');
    assert.equal(db.prepare("SELECT role FROM photo_event_members WHERE asset_id = 'seed'").get().role, 'possible');
});

test('dense sixty-four member propagation reads each analysis snapshot once and excludes unrelated library rows', t => {
    const { manager, db } = fixture(t);
    const ids = Array.from({ length: MAX_EVENT_MEMBERS }, (_, index) => `dense-${index}`);
    const outsiders = Array.from({ length: 10 }, (_, index) => `outside-${index}`);
    for (const id of [...ids, ...outsiders]) {
        photo(manager, id);
        observations(manager, id, [feature('scene', 'Dense fixture carved fireplace', 'medium'),
            feature('clothing', 'Dense fixture green velvet jacket', 'medium')]);
    }
    for (const id of ids.slice(0, 32)) { confirmDate(manager, id); }
    const event = { id: 'dense-event', seedAssetId: ids[0], state: 'supported', confidence: 'medium', revision: 1 };
    db.prepare("INSERT INTO photo_events(id,seed_asset_id,state,confidence,created_at,updated_at) VALUES (?,?,'supported','medium','fixture','fixture')")
        .run(event.id, event.seedAssetId);
    const insert = db.prepare("INSERT INTO photo_event_members(event_id,asset_id,role,confidence,state,evidence_json,revision) VALUES (?,?,'strong','medium','active','[]',1)");
    for (const id of ids) { insert.run(event.id, id); }
    const original = analysisRepository.loadAnalysis;
    const originalAssessment = candidateRepository.assessPhotoLink;
    const reads = [];
    const pairs = [];
    analysisRepository.loadAnalysis = (subjectManager, assetId) => { reads.push(assetId); return original(subjectManager, assetId); };
    candidateRepository.assessPhotoLink = (subjectManager, left, right) => {
        pairs.push([left, right].sort());
        return originalAssessment(subjectManager, left, right);
    };
    const started = performance.now();
    let result;
    try { result = propagateEventEvidence(manager, event); }
    finally {
        analysisRepository.loadAnalysis = original;
        candidateRepository.assessPhotoLink = originalAssessment;
    }
    t.diagnostic(`Dense propagation: ${Math.round(performance.now() - started)}ms, ${reads.length} snapshot reads, ${pairs.length} direct pairs`);
    assert.deepEqual([...reads].sort(), [...ids].sort());
    assert.equal(new Set(pairs.map(pair => JSON.stringify(pair))).size, pairs.length);
    const anchored = new Set(ids.slice(0, 32));
    assert.ok(pairs.every(pair => pair.some(id => anchored.has(id))));
    assert.ok(pairs.length <= MAX_EVENT_MEMBERS * (MAX_EVENT_MEMBERS - 1) / 2);
    assert.equal(result.assetIds.length, MAX_EVENT_MEMBERS);
    assert.equal(result.conflicting, false);
    assert.equal(dateClaim(manager, ids[63]).confidence, 'medium');
    for (const id of outsiders) { assert.equal(dateClaim(manager, id), undefined); }
});
