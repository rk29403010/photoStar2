const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { buildFamilyIdentityContext, queuePersonPhotoReconsideration } = require('../../dist/core/src/services/relatedPhotos/identityContext.js');

function fixture(t) {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, asset_identity_guid TEXT);
        CREATE TABLE faces (id TEXT PRIMARY KEY, visual_region_id TEXT);
        CREATE TABLE visual_regions (id TEXT PRIMARY KEY, asset_identity_guid TEXT);
        CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT, birth_date TEXT, death_date TEXT, lifecycle_status TEXT);
        CREATE TABLE face_person_candidates (face_id TEXT, person_id TEXT, rank INTEGER, decision_status TEXT);
        CREATE TABLE related_face_candidates (face_id TEXT, person_id TEXT, event_id TEXT, confidence TEXT, evidence_json TEXT, root_claim_ids_json TEXT);
        CREATE TABLE photo_event_members (event_id TEXT, asset_id TEXT, state TEXT, role TEXT, revision INTEGER);
        CREATE TABLE semantic_entities (id TEXT PRIMARY KEY, kind TEXT, native_id TEXT);
        CREATE TABLE semantic_propositions (id TEXT PRIMARY KEY, subject_entity_id TEXT, object_entity_id TEXT, predicate TEXT);
        CREATE TABLE semantic_decisions (id TEXT, proposition_id TEXT, status TEXT, is_current INTEGER, source_kind TEXT);
        CREATE TABLE analysis_claims (id TEXT PRIMARY KEY, asset_id TEXT, subject_id TEXT, field TEXT, kind TEXT, state TEXT, value_json TEXT);
        CREATE TABLE analysis_sources (id TEXT PRIMARY KEY, asset_id TEXT, kind TEXT, state TEXT);
        CREATE TABLE analysis_claim_sources (claim_id TEXT, source_id TEXT);
        CREATE TABLE analysis_claim_roots (claim_id TEXT, root_claim_id TEXT);
        CREATE VIEW photo_analysis_winners AS SELECT * FROM analysis_claims WHERE state = 'active';
        CREATE TABLE family_trees (id TEXT PRIMARY KEY, gedcom_content TEXT);
        CREATE TABLE people_gedcom_links (person_id TEXT, gedcom_tree_id TEXT, gedcom_person_id TEXT);
        CREATE TABLE related_photo_queue (asset_id TEXT PRIMARY KEY, cause TEXT, revision INTEGER, status TEXT, attempts INTEGER, error TEXT, updated_at TEXT);
        INSERT INTO assets VALUES ('photo','guid'), ('other','other-guid');
        INSERT INTO visual_regions VALUES ('region','guid'), ('other-region','other-guid');
        INSERT INTO faces VALUES ('face','region'), ('other-face','other-region');
        INSERT INTO people VALUES ('known','Known Person',NULL,NULL,'confirmed'),
            ('relative','Mapped Relative',NULL,NULL,'confirmed'), ('unrelated','Other Person',NULL,NULL,'confirmed');
        INSERT INTO face_person_candidates VALUES ('face','known',1,NULL);
    `);
    t.after(() => db.close());
    return { db, manager: { getDb: () => db } };
}

function claim(db, id, field, value, kind = 'observation', subject = 'face', asset = 'photo') {
    db.prepare('INSERT INTO analysis_claims VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, asset, subject, field, kind, 'active', JSON.stringify(value));
}

function decision(db, person, status = 'rejected', face = 'face') {
    db.prepare('INSERT INTO semantic_entities VALUES (?, ?, ?)').run(`entity-${person}`, 'person', person);
    db.prepare('INSERT INTO semantic_propositions VALUES (?, ?, ?, ?)').run(`proposition-${person}`, face, `entity-${person}`, 'depicts');
    db.prepare('INSERT INTO semantic_decisions VALUES (?, ?, ?, ?, ?)').run(`decision-${person}`, `proposition-${person}`, status, 1, 'human');
}

function tree(db, birth = '1910', relativeBirth = '1940') {
    const content = `0 @I1@ INDI\n1 NAME Recorded /Person/\n1 BIRT\n2 DATE ${birth}\n1 DEAT\n2 DATE 2000\n1 RESI\n2 DATE 1950\n2 PLAC Recorded town\n1 FAMS @F1@\n0 @I2@ INDI\n1 NAME Mapped /Relative/\n1 BIRT\n2 DATE ${relativeBirth}\n1 FAMC @F1@\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@`;
    db.prepare('INSERT INTO family_trees VALUES (?, ?)').run('tree', content);
    db.exec("INSERT INTO people_gedcom_links VALUES ('known','tree','@I1@'), ('relative','tree','@I2@')");
}

test('linked GEDCOM provides birth, residence and mapped family candidates without inventing identities or writing', t => {
    const { db, manager } = fixture(t); tree(db);
    const before = db.prepare('SELECT total_changes() AS count').get().count;
    const result = buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' });
    assert.deepEqual(result.map(item => item.personId), ['known', 'relative']);
    assert.equal(result[0].label, 'Known Person');
    assert.equal(result[0].sourceId, 'gedcom:tree:@I1@');
    assert.match(result[0].text, /Birth 1910.*Residence DATE 1950; PLAC Recorded town/);
    assert.match(result[1].text, /requires review/);
    assert.match(result[1].text, /Family of Recorded Person/);
    assert.ok(result.every(item => item.text.length <= 180));
    assert.equal(db.prepare('SELECT total_changes() AS count').get().count, before);
});

test('age plausibility filters candidates only with both event date and independent observed age', t => {
    const { db, manager } = fixture(t); tree(db);
    claim(db, 'age', 'appearance', { apparentAge: { min: 8, max: 12 } });
    assert.equal(buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' }).length, 2);
    claim(db, 'date', 'date', { start: '1950-01-01', end: '1950-12-31' }, 'user_confirmed', null);
    const result = buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' });
    assert.deepEqual(result.map(item => item.personId), ['relative']);
    assert.equal(JSON.parse(db.prepare("SELECT value_json FROM analysis_claims WHERE id = 'age'").get().value_json).apparentAge.min, 8);
});

test('human-confirmed identity survives visual-age contradiction while rejected candidates stay excluded', t => {
    const { db, manager } = fixture(t); tree(db);
    decision(db, 'known', 'accepted'); decision(db, 'relative');
    claim(db, 'age', 'appearance', { apparentAge: { min: 8, max: 12 } });
    claim(db, 'date', 'date', { start: '1950-01-01', end: '1950-12-31' }, 'user_confirmed', null);
    const result = buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' });
    assert.deepEqual(result.map(item => item.personId), ['known']);
    assert.match(result[0].text, /Human-confirmed identity.*Visual age\/date contradiction/);
});

test('missing or approximate family dates never manufacture an age exclusion; face ownership and limits are enforced', t => {
    const { db, manager } = fixture(t); tree(db, 'ABT 1910', 'unknown');
    claim(db, 'age', 'appearance', { apparentAge: { min: 8, max: 12 } });
    claim(db, 'date', 'date', { start: '1950-01-01', end: '1950-12-31' }, 'hypothesis', null);
    assert.equal(buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face', limit: 1 }).length, 1);
    assert.equal(buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' }).length, 2);
    assert.throws(() => buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'other-face' }), /belong/);
    assert.throws(() => buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face', limit: 11 }), /limit/);
});

test('person changes queue all confirmed and candidate photos and increment revision for replay after restart', t => {
    const { db, manager } = fixture(t);
    claim(db, 'identity', 'identity', { personId: 'known' }, 'user_confirmed', 'other-face', 'other');
    assert.equal(queuePersonPhotoReconsideration(manager, 'known', 'gedcom_changed'), 2);
    assert.equal(queuePersonPhotoReconsideration(manager, 'known', 'person_confirmed'), 2);
    const rows = db.prepare('SELECT asset_id, revision, status, cause FROM related_photo_queue ORDER BY asset_id').all();
    assert.deepEqual(rows, [
        { asset_id: 'other', revision: 2, status: 'pending', cause: 'person_confirmed' },
        { asset_id: 'photo', revision: 2, status: 'pending', cause: 'person_confirmed' },
    ]);
    assert.equal(queuePersonPhotoReconsideration(manager, 'unrelated', 'changed'), 0);
});

test('network candidates feed bounded context and reconsideration without bypassing human rejection', t => {
    const { db, manager } = fixture(t);
    networkCandidate(db, 'root');
    claim(db, 'root', 'identity', { personId: 'relative' }, 'user_confirmed', 'other-face', 'other');
    decision(db, 'known');
    assert.deepEqual(buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face', limit: 1 })
        .map(item => item.personId), ['relative']);
    assert.equal(queuePersonPhotoReconsideration(manager, 'relative', 'tree_changed'), 2);
    decision(db, 'relative');
    assert.deepEqual(buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' }), []);
});

function networkCandidate(db, root) {
    db.prepare('INSERT INTO related_face_candidates VALUES (?, ?, ?, ?, ?, ?)')
        .run('face', 'relative', 'event', 'medium', JSON.stringify({ targetRevision: 2,
            sources: [{ assetId: 'other', revision: 1 }] }), JSON.stringify([root]));
    db.exec("INSERT INTO photo_event_members VALUES ('event','photo','active','strong',2), ('event','other','active','anchored',1)");
}

function candidates(manager) {
    return buildFamilyIdentityContext(manager, { assetId: 'photo', faceId: 'face' }).map(item => item.personId);
}

test('corrected or rejected analysis identity roots withdraw stale network candidates immediately', t => {
    const { db, manager } = fixture(t);
    networkCandidate(db, 'root');
    claim(db, 'root', 'identity', { personId: 'relative' }, 'user_confirmed', 'other-face', 'other');
    assert.ok(candidates(manager).includes('relative'));
    db.exec("UPDATE analysis_claims SET state = 'superseded' WHERE id = 'root'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE analysis_claims SET state = 'rejected' WHERE id = 'root'");
    assert.ok(!candidates(manager).includes('relative'));
});

test('only current accepted human semantic identity decisions supply valid network roots', t => {
    const { db, manager } = fixture(t);
    decision(db, 'relative', 'accepted', 'other-face');
    networkCandidate(db, 'decision-relative');
    assert.ok(candidates(manager).includes('relative'));
    db.exec("UPDATE semantic_decisions SET source_kind = 'machine' WHERE id = 'decision-relative'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE semantic_decisions SET source_kind = 'human', is_current = 0 WHERE id = 'decision-relative'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE semantic_decisions SET is_current = 1, status = 'rejected' WHERE id = 'decision-relative'");
    assert.ok(!candidates(manager).includes('relative'));
});

test('target event membership revision and support role invalidate stale network identity context', t => {
    const { db, manager } = fixture(t);
    claim(db, 'root', 'identity', { personId: 'relative' }, 'user_confirmed', 'other-face', 'other');
    networkCandidate(db, 'root');
    assert.ok(candidates(manager).includes('relative'));
    db.exec("UPDATE photo_event_members SET revision = 3 WHERE asset_id = 'photo'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE photo_event_members SET revision = 2, state = 'withdrawn' WHERE asset_id = 'photo'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE photo_event_members SET state = 'active', role = 'possible' WHERE asset_id = 'photo'");
    assert.ok(!candidates(manager).includes('relative'));
});

test('withdrawn or revised support memberships invalidate network candidates even while the identity root stays confirmed', t => {
    const { db, manager } = fixture(t);
    claim(db, 'root', 'identity', { personId: 'relative' }, 'user_confirmed', 'other-face', 'other');
    networkCandidate(db, 'root');
    assert.ok(candidates(manager).includes('relative'));
    db.exec("UPDATE photo_event_members SET revision = 2 WHERE asset_id = 'other'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE photo_event_members SET revision = 1, state = 'rejected' WHERE asset_id = 'other'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE photo_event_members SET state = 'active', role = 'possible' WHERE asset_id = 'other'");
    assert.ok(!candidates(manager).includes('relative'));
    db.exec("UPDATE related_face_candidates SET evidence_json = '{\"targetRevision\":2,\"sources\":[]}'");
    assert.ok(!candidates(manager).includes('relative'));
});
