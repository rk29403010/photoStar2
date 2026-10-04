const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { retrieveAnalysisContext } = require('../../dist/core/src/services/photoAnalysis/context.js');
const { PHOTO_ANALYSIS_SCHEMA_SQL } = require('../../dist/core/src/data/schema/photoAnalysis.js');
const { PHOTO_ANALYSIS_DISPLAY_SQL } = require('../../dist/core/src/data/schema/photoAnalysisDisplay.js');

function fixture(t) {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, asset_identity_guid TEXT, original_path TEXT, exif_datetime TEXT, metadata_timestamp_source TEXT);
        CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT, birth_date TEXT, death_date TEXT, lifecycle_status TEXT);
        CREATE TABLE faces (id TEXT PRIMARY KEY, visual_region_id TEXT);
        CREATE TABLE visual_regions (id TEXT PRIMARY KEY, asset_identity_guid TEXT);
        CREATE TABLE face_person_candidates (face_id TEXT, person_id TEXT, raw_cosine REAL, rank INTEGER, decision_status TEXT);
        CREATE TABLE semantic_entities (id TEXT PRIMARY KEY, kind TEXT, native_id TEXT, label TEXT);
        CREATE TABLE semantic_propositions (id TEXT PRIMARY KEY, subject_entity_id TEXT, object_entity_id TEXT, predicate TEXT);
        CREATE TABLE semantic_decisions (id TEXT, proposition_id TEXT, status TEXT, is_current INTEGER, source_kind TEXT);
        CREATE TABLE people_gedcom_links (person_id TEXT, gedcom_tree_id TEXT, gedcom_person_id TEXT);
        CREATE TABLE family_trees (id TEXT, gedcom_content TEXT);
        INSERT INTO assets VALUES ('photo', 'photo-guid', 'C:\\Archive\\Christmas 76.jpg', '2025:01:01', 'scan'),
            ('related', 'related-guid', 'C:\\Archive\\Related.jpg', NULL, NULL),
            ('unrelated', 'unrelated-guid', 'C:\\Archive\\Other.jpg', NULL, NULL);
        INSERT INTO visual_regions VALUES ('r1', 'photo-guid'), ('r2', 'related-guid'), ('r3', 'unrelated-guid');
        INSERT INTO faces VALUES ('face-a', 'r1'), ('face-b', 'r2'), ('face-c', 'r3');
    `);
    db.exec(PHOTO_ANALYSIS_SCHEMA_SQL);
    db.exec(PHOTO_ANALYSIS_DISPLAY_SQL);
    t.after(() => db.close());
    return { db, manager: { getDb: () => db } };
}

const faces = [{ faceId: 'face-a', modelFaceId: 'F1', box: { x: 0, y: 0, width: 0.1, height: 0.1 } }];
const targets = [{ field: 'date', subjectId: null, question: 'Which decade?', concern: 'date' }];

function person(db, id, options = {}) {
    db.prepare('INSERT INTO people VALUES (?, ?, ?, ?, ?)').run(id, options.name ?? id,
        options.birth ?? '1920-01-01', options.death ?? '2000-01-01', options.status ?? 'confirmed');
    db.prepare('INSERT INTO semantic_entities VALUES (?, ?, ?, ?)').run(`entity-${id}`, 'person', id, options.name ?? id);
}

function candidate(db, id, rank, status = null) {
    db.prepare('INSERT INTO face_person_candidates VALUES (?, ?, ?, ?, ?)').run('face-a', id, 0.9 - rank * 0.01, rank, status);
}

function decision(db, faceId, personId, status, sourceKind = 'human') {
    const proposition = `${faceId}-${personId}`;
    db.prepare('INSERT INTO semantic_propositions VALUES (?, ?, ?, ?)').run(proposition, faceId, `entity-${personId}`, 'depicts');
    db.prepare('INSERT INTO semantic_decisions VALUES (?, ?, ?, ?, ?)').run(`decision-${proposition}`, proposition, status, 1, sourceKind);
}

function claim(db, assetId, id, field, value, kind = 'user_confirmed', subjectId = null, state = 'active') {
    db.prepare(`INSERT OR IGNORE INTO analysis_runs VALUES (?, ?, 'user', 'human', NULL, 'user-v1', 'successful', '{}', '{}', '[]', '2026-01-01')`)
        .run(`run-${assetId}`, assetId);
    db.prepare(`INSERT INTO analysis_claims VALUES (?, ?, ?, ?, ?, ?, 'high', ?, ?, NULL, '2026-01-01')`)
        .run(id, assetId, `run-${assetId}`, field, subjectId, JSON.stringify(value), kind, state);
}

test('retrieval keeps scan timestamp separate from photographic date and never mutates records', t => {
    const { db, manager } = fixture(t);
    claim(db, 'photo', 'date-confirmed', 'date', { label: '1976', start: '1976-01-01', end: '1976-12-31' });
    const before = db.prepare('SELECT total_changes() AS count').get().count;
    const result = retrieveAnalysisContext(manager, { assetId: 'photo', faces: [], targets, sourcePrefix: 'run-one' });
    assert.match(result.sources.find(source => source.refId === 'photo:filename').text, /Christmas 76/);
    assert.match(result.sources.find(source => source.refId === 'photo:exif_datetime').text, /scan.*rather than the photographed event/);
    assert.match(result.sources.find(source => source.refId === 'date-confirmed').text, /user-confirmed date.*1976/);
    assert.equal(db.prepare('SELECT total_changes() AS count').get().count, before);
    assert.ok(result.sources.every(source => source.assetId === 'photo' && source.id.startsWith('run-one:context:')));
});

test('only bounded known identity candidates survive current rejection and person lifecycle rules', t => {
    const { db, manager } = fixture(t);
    for (const id of ['best', 'second', 'cached-rejected', 'human-rejected', 'provisional', 'confirmed']) {
        person(db, id, { status: id === 'provisional' ? 'provisional' : 'confirmed' });
    }
    candidate(db, 'best', 1); candidate(db, 'second', 2); candidate(db, 'cached-rejected', 3, 'rejected');
    candidate(db, 'human-rejected', 4); candidate(db, 'provisional', 5);
    decision(db, 'face-a', 'human-rejected', 'rejected');
    decision(db, 'face-a', 'confirmed', 'accepted');
    const result = retrieveAnalysisContext(manager, { assetId: 'photo', faces, targets, maxCandidates: 2 });
    assert.deepEqual(result.candidates.map(item => item.personId), ['confirmed', 'best']);
    assert.match(result.sources.find(source => source.refId === 'face-a:best').text, /raw cosine.*not a probability/);
    assert.match(result.sources.find(source => source.refId === 'face-a:best').text, /Person birth.*separate from observed appearance/);
    assert.ok(result.candidates.every(item => result.sources.some(source => source.id === item.sourceId)));
});

test('human identity without a recognition row remains available; contexts never invent arbitrary names', t => {
    const { db, manager } = fixture(t);
    person(db, 'human-only', { name: 'Recorded Person' }); person(db, 'unrelated-known');
    claim(db, 'photo', 'identity-confirmed', 'identity', { personId: 'human-only' }, 'user_confirmed', 'face-a');
    const result = retrieveAnalysisContext(manager, { assetId: 'photo', faces,
        targets: [{ field: 'identity', subjectId: 'face-a', question: 'Assess candidate', concern: 'identity' }] });
    assert.deepEqual(result.candidates.map(item => item.label), ['Recorded Person']);
    assert.equal(result.candidates[0].personId, 'human-only');
    assert.ok(!result.sources.some(source => source.text.includes('unrelated-known')));
});

test('related-photo context requires confirmed identity and confirmed active date/location evidence', t => {
    const { db, manager } = fixture(t);
    person(db, 'candidate'); candidate(db, 'candidate', 1);
    decision(db, 'face-b', 'candidate', 'accepted');
    decision(db, 'face-c', 'candidate', 'accepted', 'machine');
    claim(db, 'related', 'related-date', 'date', { label: '1940', start: '1940-01-01', end: '1940-12-31' });
    claim(db, 'related', 'related-location', 'location', { label: 'Paris', country: 'France', locality: 'Paris' });
    claim(db, 'related', 'old-date', 'date', { label: '1900' }, 'user_confirmed', null, 'superseded');
    claim(db, 'unrelated', 'unrelated-date', 'date', { label: '1980' });
    db.prepare('INSERT INTO people_gedcom_links VALUES (?, ?, ?)').run('candidate', 'tree-a', '@I1@');
    const result = retrieveAnalysisContext(manager, { assetId: 'photo', faces, targets });
    assert.deepEqual(result.sources.filter(source => source.kind === 'related_photo').map(source => source.refId), ['related-date', 'related-location']);
    assert.ok(result.sources.some(source => source.refId === 'gedcom:tree-a:@I1@'));
    assert.match(result.sources.find(source => source.refId === 'related-date').text, /retrieved candidate/);
});

test('source caps preserve referential integrity and scopes reject faces from another photo', t => {
    const { db, manager } = fixture(t);
    person(db, 'first'); person(db, 'second'); candidate(db, 'first', 1); candidate(db, 'second', 2);
    const capped = retrieveAnalysisContext(manager, { assetId: 'photo', faces, targets, maxSources: 3 });
    assert.equal(capped.sources.length, 3); assert.equal(capped.candidates.length, 1);
    assert.ok(capped.sources.some(source => source.id === capped.candidates[0].sourceId));
    assert.throws(() => retrieveAnalysisContext(manager, { assetId: 'photo', faces: [{ ...faces[0], faceId: 'face-c' }], targets }), /belong/);
    assert.throws(() => retrieveAnalysisContext(manager, { assetId: 'photo', faces, targets, maxCandidates: 0 }), /limit/);
    const first = retrieveAnalysisContext(manager, { assetId: 'photo', faces: [], targets });
    const second = retrieveAnalysisContext(manager, { assetId: 'photo', faces: [], targets });
    assert.ok(first.sources.every(source => !second.sources.some(other => other.id === source.id)));
});
