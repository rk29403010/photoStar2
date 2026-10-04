const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { indexPhotoFeatures, loadPhotoLinkFeatures } = require('../../dist/core/src/services/relatedPhotos/features.js');
const { findRelatedPhotoCandidates, assessPhotoLink } = require('../../dist/core/src/services/relatedPhotos/candidates.js');

function fixture(t) {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, original_path TEXT, asset_identity_guid TEXT, binned_at TEXT);
        CREATE TABLE analysis_runs (id TEXT PRIMARY KEY, stage TEXT, asset_id TEXT, status TEXT);
        CREATE TABLE analysis_claims (id TEXT PRIMARY KEY, asset_id TEXT, run_id TEXT, field TEXT, value_json TEXT, confidence TEXT, state TEXT, kind TEXT, subject_id TEXT);
        CREATE TABLE analysis_sources (id TEXT, state TEXT);
        CREATE TABLE analysis_claim_sources (claim_id TEXT, source_id TEXT);
        CREATE TABLE analysis_claim_roots (claim_id TEXT, root_claim_id TEXT);
        CREATE TABLE analysis_claim_memberships (claim_id TEXT, event_id TEXT, asset_id TEXT, revision INTEGER);
        CREATE TABLE photo_event_members (event_id TEXT, asset_id TEXT, state TEXT, revision INTEGER);
        CREATE TABLE analysis_regions (id TEXT, asset_id TEXT, run_id TEXT, label TEXT);
        CREATE TABLE album_items (album_id TEXT, asset_id TEXT, PRIMARY KEY(album_id, asset_id));
        CREATE TABLE faces (id TEXT, visual_region_id TEXT);
        CREATE TABLE visual_regions (id TEXT, asset_identity_guid TEXT);
        CREATE TABLE semantic_propositions (id TEXT, subject_entity_id TEXT, object_entity_id TEXT, predicate TEXT);
        CREATE TABLE semantic_decisions (id TEXT, proposition_id TEXT, is_current INTEGER, status TEXT, source_kind TEXT);
        CREATE TABLE semantic_entities (id TEXT, kind TEXT, native_id TEXT);
        CREATE TABLE capture_sequences (id TEXT PRIMARY KEY, status TEXT);
        CREATE TABLE capture_sequence_members (sequence_id TEXT, asset_identity_guid TEXT, ordinal INTEGER, status TEXT);
        CREATE TABLE visual_similarity_observations (asset_identity_guid_a TEXT, asset_identity_guid_b TEXT);
        CREATE TABLE related_photo_features (asset_id TEXT, kind TEXT, feature_key TEXT, label TEXT, confidence TEXT, source_id TEXT,
            PRIMARY KEY(asset_id,kind,feature_key,source_id));
        CREATE INDEX related_feature_lookup ON related_photo_features(kind,feature_key,asset_id);
        CREATE TABLE related_photo_order (asset_id TEXT PRIMARY KEY, context_key TEXT, ordinal INTEGER);
        CREATE INDEX related_order_lookup ON related_photo_order(context_key, ordinal);`);
    t.after(() => db.close());
    return { db, manager: { getDb: () => db } };
}

function addPhoto(db, id, file = `${id}.jpg`) {
    db.prepare('INSERT INTO assets VALUES (?, ?, ?, NULL)').run(id, `C:\\Archive\\${file}`, `identity-${id}`);
}

function addFeatures(db, id, features, kind = 'observation', state = 'active') {
    const run = `run-${id}-${kind}-${state}`;
    db.prepare('INSERT INTO analysis_runs VALUES (?, ?, ?, ?)').run(run, 'scout', id, 'successful');
    db.prepare('INSERT INTO analysis_claims VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
        .run(`claim-${run}`, id, run, 'link_features', JSON.stringify(features), 'high', state, kind);
}

function feature(kind, key, confidence = 'high') { return { kind, key, label: key, confidence }; }

test('matching uses independent visual observations and does not index inferred or rejected metadata', t => {
    const { db, manager } = fixture(t);
    for (const id of ['a', 'b', 'inferred', 'rejected']) { addPhoto(db, id); }
    const observations = [feature('scene', 'Red striped wallpaper and oak cabinet'), feature('clothing', 'Blue coat with white collar')];
    addFeatures(db, 'a', observations); addFeatures(db, 'b', observations);
    addFeatures(db, 'inferred', observations, 'inferred_conclusion');
    addFeatures(db, 'rejected', observations, 'observation', 'rejected');
    for (const id of ['a', 'b', 'inferred', 'rejected']) { indexPhotoFeatures(manager, id); }
    assert.equal(assessPhotoLink(manager, 'a', 'b').role, 'strong');
    assert.equal(assessPhotoLink(manager, 'a', 'inferred').role, 'possible');
    assert.ok(!loadPhotoLinkFeatures(manager, 'rejected').some(item => item.kind === 'scene'));
    assert.ok(assessPhotoLink(manager, 'a', 'b').evidence.every(item => item.sourceIds.length === 2));
});

test('generic Christmas cues, repeated labels and local context cannot make a strong event link', t => {
    const { db, manager } = fixture(t);
    for (const id of ['a', 'b', 'c', 'd']) { addPhoto(db, id); }
    addFeatures(db, 'a', [feature('scene', 'Christmas tree'), feature('clothing', 'suit'), feature('season', 'winter')]);
    addFeatures(db, 'b', [feature('scene', 'Christmas tree'), feature('clothing', 'suit'), feature('season', 'winter')]);
    addFeatures(db, 'c', [feature('scene', 'Oak cabinet'), feature('object', 'Oak cabinet')]);
    addFeatures(db, 'd', [feature('scene', 'Oak cabinet'), feature('object', 'Oak cabinet')]);
    for (const id of ['a', 'b', 'c', 'd']) { indexPhotoFeatures(manager, id); }
    assert.equal(assessPhotoLink(manager, 'a', 'b').role, 'possible');
    assert.equal(assessPhotoLink(manager, 'c', 'd').role, 'possible');
});

test('model features cannot fabricate confirmed identity or local album context', t => {
    const { db, manager } = fixture(t);
    addPhoto(db, 'a');
    addFeatures(db, 'a', [feature('person', 'invented-person'), feature('album', 'invented-album')]);
    indexPhotoFeatures(manager, 'a');
    assert.deepEqual(loadPhotoLinkFeatures(manager, 'a').map(item => item.kind), ['folder']);
});

test('candidate postings and global output stay bounded while filename windows find nearby scans', t => {
    const { db, manager } = fixture(t);
    for (let index = 0; index < 80; index++) {
        const id = `p${String(index).padStart(3, '0')}`;
        addPhoto(db, id, `scan_${String(index).padStart(3, '0')}.jpg`);
        addFeatures(db, id, [feature('scene', 'Same decorated hall')]);
        indexPhotoFeatures(manager, id);
    }
    const candidates = findRelatedPhotoCandidates(manager, 'p040');
    assert.ok(candidates.length <= 40);
    assert.ok(candidates.includes('p039') && candidates.includes('p041'));
    assert.equal(findRelatedPhotoCandidates(manager, 'p040', 5).length, 5);
    assert.throws(() => findRelatedPhotoCandidates(manager, 'p040', 101), /limit/);
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT asset_id FROM related_photo_features WHERE kind = ? AND feature_key = ? LIMIT 12')
        .all('scene', 'same decorated hall');
    assert.ok(plan.some(row => row.detail.includes('related_feature_lookup')));
});

test('feature confidence cannot exceed its claim and related-derived observations cannot bootstrap links', t => {
    const { db, manager } = fixture(t);
    for (const id of ['a', 'b', 'derived']) { addPhoto(db, id); }
    const observations = [feature('scene', 'Red striped wallpaper'), feature('clothing', 'Blue coat with white collar')];
    for (const id of ['a', 'b', 'derived']) { addFeatures(db, id, observations); }
    db.prepare("UPDATE analysis_claims SET confidence = 'low' WHERE asset_id = 'b'").run();
    db.prepare('INSERT INTO analysis_claim_roots VALUES (?, ?)').run('claim-run-derived-observation-active', 'claim-run-a-observation-active');
    for (const id of ['a', 'b', 'derived']) { indexPhotoFeatures(manager, id); }
    assert.equal(assessPhotoLink(manager, 'a', 'b').role, 'possible');
    assert.ok(!loadPhotoLinkFeatures(manager, 'derived').some(item => item.kind === 'scene'));
    db.prepare("UPDATE analysis_claims SET state = 'rejected' WHERE asset_id = 'a'").run();
    assert.ok(!loadPhotoLinkFeatures(manager, 'a').some(item => item.kind === 'scene'));
});

test('newer per-Face appearance replaces old clothing observations in search features', t => {
    const { db, manager } = fixture(t);
    addPhoto(db, 'a');
    db.prepare("INSERT INTO analysis_runs VALUES ('appearance-run', 'scout', 'a', 'successful')").run();
    const insert = db.prepare("INSERT INTO analysis_claims VALUES (?, 'a', 'appearance-run', 'appearance', ?, 'high', 'active', 'observation', 'face-a')");
    insert.run('old-appearance', JSON.stringify({ clothing: 'Old red coat' }));
    insert.run('new-appearance', JSON.stringify({ clothing: 'New blue coat' }));
    indexPhotoFeatures(manager, 'a');
    assert.deepEqual(loadPhotoLinkFeatures(manager, 'a').filter(item => item.kind === 'clothing').map(item => item.key), ['new blue coat']);
});
