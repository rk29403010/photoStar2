const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const { createStableFaceDetection } = require('../../dist/core/src/services/faces/stableFaceRepository.js');
const { recordManualFacePersonDecisionByFaceId } = require('../../dist/core/src/services/faces/manualFaceSemanticRepository.js');
const lifecycle = require('../../dist/core/src/services/faces/personLifecycleRepository.js');
const { gedcomCommandHandlers } = require('../../dist/core/src/services/handlers/gedcomCommands.js');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-related-triggers-'));
    const manager = new DatabaseManager(dir);
    const db = manager.getDb();
    t.after(() => { manager.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    db.exec("INSERT INTO people(id,name) VALUES ('old','Old'), ('current','Current'), ('family','Family')");
    const faces = {};
    for (const id of ['anchor', 'old-peer', 'current-peer', 'family-peer', 'unrelated']) {
        db.prepare('INSERT INTO assets(id,original_path) VALUES (?,?)').run(id, `C:/test/${id}.jpg`);
        const face = createStableFaceDetection(db, { assetId: id, sourceAnalysisGenerationId: `detect-${id}`,
            box: { x: 0, y: 0, width: 0.2, height: 0.2 }, sourceWidth: 100, sourceHeight: 100,
            sourceOrientation: 1, sourceModuleId: 'runtime.detect_faces', provider: 'test', modelVersion: '1' });
        db.prepare('INSERT INTO asset_mask_metadata(asset_id,source_id,schema_version,data) VALUES (?,?,1,?)')
            .run(id, 'runtime.detect_faces', JSON.stringify({ schemaVersion: 1, masks: [{ visualRegionId: face.visualRegionId }] }));
        faces[id] = face.faceId;
    }
    decide(db, faces['old-peer'], 'old');
    decide(db, faces['current-peer'], 'current');
    decide(db, faces['family-peer'], 'family');
    db.exec('DELETE FROM related_photo_queue');
    return { db, manager, faces };
}

function decide(db, faceId, personId, status = 'accepted') {
    return recordManualFacePersonDecisionByFaceId(db, { faceId, personId, status, sourceRef: 'test:user' });
}

function queued(db) {
    return db.prepare('SELECT asset_id FROM related_photo_queue ORDER BY asset_id').all().map(row => row.asset_id);
}

function tree(db, id = 'tree') {
    db.prepare('INSERT INTO family_trees(id,filename,file_hash,gedcom_content,tree_group_id) VALUES (?,?,?,?,?)')
        .run(id, `${id}.ged`, id, '0 @I1@ INDI\n1 NAME Recorded /Person/', id);
}

function command(manager, name, payload) {
    let result;
    gedcomCommandHandlers[name]({ id: 'test', command: name, payload, dbManager: manager,
        respond(_id, status, data, error) { result = { status, data, error }; } });
    return result;
}

test('manual confirmation, replacement and rejection durably queue affected old/current People only', t => {
    const { db, faces } = fixture(t);
    decide(db, faces.anchor, 'old');
    db.exec('DELETE FROM related_photo_queue');
    const replacement = decide(db, faces.anchor, 'current');
    assert.deepEqual(queued(db), ['anchor', 'current-peer', 'old-peer']);
    assert.equal(db.prepare('SELECT is_current FROM semantic_decisions WHERE id = ?').get(replacement.decisionId).is_current, 1);
    db.exec('DELETE FROM related_photo_queue');
    decide(db, faces.anchor, 'current', 'rejected');
    assert.deepEqual(queued(db), ['anchor', 'current-peer']);
});

test('manual truth and queue roll back together when refresh persistence fails', t => {
    const { db, faces } = fixture(t);
    const before = db.prepare('SELECT COUNT(*) AS count FROM semantic_decisions').get().count;
    db.exec("CREATE TRIGGER fail_refresh BEFORE INSERT ON related_photo_queue BEGIN SELECT RAISE(ABORT,'refresh failed'); END");
    assert.throws(() => decide(db, faces.anchor, 'old'), /refresh failed/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_decisions').get().count, before);
    assert.deepEqual(queued(db), []);
});

test('confirm, retire and merge reconsider their real affected photos and preserve caller atomicity', t => {
    const { db } = fixture(t);
    lifecycle.markPersonConfirmed(db, 'old');
    assert.deepEqual(queued(db), ['old-peer']);
    db.exec('DELETE FROM related_photo_queue');
    lifecycle.retirePerson(db, 'family');
    assert.deepEqual(queued(db), ['family-peer']);
    db.exec('DELETE FROM related_photo_queue');
    lifecycle.redirectMergedPerson(db, 'old', 'current', null);
    assert.deepEqual(queued(db), ['current-peer', 'old-peer']);
    assert.equal(lifecycle.resolveCurrentPersonId(db, 'old'), 'current');
    db.exec('DELETE FROM related_photo_queue');
    assert.throws(() => db.transaction(() => { lifecycle.retirePerson(db, 'current'); throw new Error('outer rollback'); })(), /outer rollback/);
    assert.equal(db.prepare("SELECT lifecycle_status FROM people WHERE id='current'").get().lifecycle_status, 'confirmed');
    assert.deepEqual(queued(db), []);
});

test('GEDCOM link/unlink/delete queue tree-linked peer context before roots are removed', t => {
    const { db, manager } = fixture(t); tree(db); tree(db, 'unrelated-tree');
    db.exec("INSERT INTO people_gedcom_links(person_id,gedcom_tree_id,gedcom_person_id) VALUES ('family','tree','@I2@'),('old','unrelated-tree','@I3@')");
    const payload = { personId: 'current', gedcomTreeId: 'tree', gedcomPersonId: '@I1@' };
    assert.equal(command(manager, 'link_person_to_gedcom', payload).status, 'ok');
    assert.deepEqual(queued(db), ['current-peer', 'family-peer']);
    db.exec('DELETE FROM related_photo_queue');
    assert.equal(command(manager, 'unlink_person_from_gedcom', payload).status, 'ok');
    assert.deepEqual(queued(db), ['current-peer', 'family-peer']);
    db.exec('DELETE FROM related_photo_queue');
    assert.equal(command(manager, 'delete_family_tree', { treeId: 'tree' }).status, 'ok');
    assert.deepEqual(queued(db), ['family-peer']);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM people_gedcom_links WHERE gedcom_tree_id='tree'").get().count, 0);
});

test('GEDCOM link truth is not committed when its durable refresh request fails', t => {
    const { db, manager } = fixture(t); tree(db);
    db.exec("CREATE TRIGGER fail_refresh BEFORE INSERT ON related_photo_queue BEGIN SELECT RAISE(ABORT,'refresh failed'); END");
    const result = command(manager, 'link_person_to_gedcom', { personId: 'old', gedcomTreeId: 'tree', gedcomPersonId: '@I1@' });
    assert.equal(result.status, 'error'); assert.match(result.error, /refresh failed/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM people_gedcom_links').get().count, 0);
});
