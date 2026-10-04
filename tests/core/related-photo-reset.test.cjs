const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, photo, observations, confirmDate, dateClaim, addSet } = require('./related-photo-network-fixtures.cjs');
const { processPhotoReconsideration } = require('../../dist/core/src/services/relatedPhotos/worker.js');
const { recordEventMembershipDecision } = require('../../dist/core/src/services/relatedPhotos/events.js');
const { snapshotDurablePhotoAnalysisState } = require('../../dist/core/src/data/photoAnalysisResetState.js');

function allRows(db, table) {
    return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

test('soft reset preserves authority, membership rejection history and genuine impacts with their dependency closure', t => {
    const { manager, db } = fixture(t);
    addSet(manager, ['anchor', 'matching', 'rejected']);
    photo(manager, 'disposable', 'elsewhere.jpg');
    db.prepare('UPDATE assets SET original_path=? WHERE id=?').run('D:\\Other Archive\\elsewhere.jpg', 'disposable');
    observations(manager, 'disposable', []);
    const authority = confirmDate(manager, 'anchor');
    const result = processPhotoReconsideration(manager, 'anchor', 'verified-date');
    assert.ok(result.impacts.some(impact => impact.assetId === 'matching' && impact.field === 'date'));
    const eventId = db.prepare('SELECT id FROM photo_events').get().id;
    recordEventMembershipDecision(manager, { eventId, assetId: 'rejected', disposition: 'confirmed', userId: 'reviewer' });
    recordEventMembershipDecision(manager, { eventId, assetId: 'rejected', disposition: 'rejected', userId: 'reviewer' });
    const tables = ['archive_impacts', 'photo_event_decisions', 'analysis_claim_roots', 'analysis_source_roots',
        'analysis_claim_memberships', 'analysis_source_memberships'];
    const before = Object.fromEntries(tables.map(table => [table, allRows(db, table)]));
    manager.resetPreservingManualData();
    const restored = manager.getDb();
    for (const table of tables) { assert.deepEqual(allRows(restored, table), before[table]); }
    assert.equal(dateClaim(manager, 'anchor').id, authority.id);
    assert.equal(dateClaim(manager, 'matching').value.label, 'Christmas 1976');
    assert.equal(dateClaim(manager, 'rejected'), undefined);
    assert.equal(restored.prepare("SELECT state FROM photo_event_members WHERE asset_id='rejected'").get().state, 'rejected');
    assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM assets WHERE id='disposable'").get().count, 0);
    assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM related_photo_features').get().count, 0);
    assert.deepEqual(restored.pragma('foreign_key_check'), []);
    assert.deepEqual(restored.prepare('SELECT DISTINCT status,cause FROM related_photo_queue').all(), [{ status: 'pending', cause: 'soft-reset' }]);
    manager.resetPreservingManualData();
    assert.deepEqual(allRows(manager.getDb(), 'archive_impacts'), before.archive_impacts);
});

test('human membership-only state retains its seed and machine members without fabricating any impacts', t => {
    const { manager, db } = fixture(t);
    for (const id of ['seed', 'reviewed', 'peer', 'unrelated']) { photo(manager, id); }
    db.exec(`INSERT INTO photo_events(id,seed_asset_id,state,confidence,created_at,updated_at)
        VALUES ('event','seed','proposed','low','2026-10-04','2026-10-04');
        INSERT INTO photo_event_members(event_id,asset_id,role,confidence,state,evidence_json)
        VALUES ('event','seed','strong','high','active','[]'), ('event','reviewed','possible','low','rejected','[]'),
            ('event','peer','possible','low','active','[]');
        INSERT INTO photo_event_decisions(id,event_id,asset_id,disposition,user_id,created_at)
        VALUES ('decision','event','reviewed','rejected','reviewer','2026-10-04');`);
    assert.deepEqual(snapshotDurablePhotoAnalysisState(db).assetIds, ['peer', 'reviewed', 'seed']);
    manager.resetPreservingManualData();
    const restored = manager.getDb();
    assert.equal(allRows(restored, 'photo_events').length, 1);
    assert.equal(allRows(restored, 'photo_event_members').length, 3);
    assert.deepEqual(allRows(restored, 'archive_impacts'), []);
    assert.deepEqual(restored.pragma('foreign_key_check'), []);
});

test('analysis rejection retains foreign source and claim roots recursively instead of dangling or resurrecting evidence', t => {
    const { manager, db } = fixture(t);
    for (const id of ['rejected', 'foreign-root', 'ancestor', 'unrelated']) { photo(manager, id); }
    const rejected = observations(manager, 'rejected');
    const foreign = observations(manager, 'foreign-root');
    const ancestor = observations(manager, 'ancestor');
    observations(manager, 'unrelated');
    const sourceId = db.prepare('SELECT id FROM analysis_sources WHERE asset_id=?').get('rejected').id;
    db.prepare('INSERT INTO analysis_source_roots(source_id,root_claim_id) VALUES (?,?)').run(sourceId, foreign.id);
    db.prepare('INSERT INTO analysis_claim_roots(claim_id,root_claim_id,role) VALUES (?,?,?)').run(rejected.id, foreign.id, 'support');
    db.prepare('INSERT INTO analysis_claim_roots(claim_id,root_claim_id,role) VALUES (?,?,?)').run(foreign.id, ancestor.id, 'support');
    db.prepare('INSERT INTO analysis_claim_decisions(id,claim_id,disposition,user_id,created_at) VALUES (?,?,?,?,?)')
        .run('rejection', rejected.id, 'rejected', 'reviewer', '2026-10-04');
    db.prepare("UPDATE analysis_claims SET state='rejected' WHERE id=?").run(rejected.id);
    assert.deepEqual(snapshotDurablePhotoAnalysisState(db).assetIds, ['ancestor', 'foreign-root', 'rejected']);
    manager.resetPreservingManualData();
    const restored = manager.getDb();
    assert.equal(restored.prepare('SELECT state FROM analysis_claims WHERE id=?').get(rejected.id).state, 'rejected');
    assert.equal(allRows(restored, 'analysis_claim_roots').length, 2);
    assert.equal(allRows(restored, 'analysis_source_roots').length, 1);
    assert.equal(allRows(restored, 'analysis_claim_decisions').length, 1);
    assert.deepEqual(allRows(restored, 'archive_impacts'), []);
    assert.deepEqual(restored.pragma('foreign_key_check'), []);
});
