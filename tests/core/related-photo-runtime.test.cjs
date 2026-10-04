const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
// Keep unrelated full-router credential imports away from the operating-system vault.
const keytarPath = require.resolve('keytar');
const rejectCredentialAccess = async () => { throw new Error('Network reconsideration must not access paid-model credentials'); };
require.cache[keytarPath] = { id: keytarPath, filename: keytarPath, loaded: true,
    exports: { getPassword: rejectCredentialAccess, setPassword: rejectCredentialAccess, deletePassword: rejectCredentialAccess } };
const { EventBus } = require('../../dist/core/src/services/events/bus.js');
const { handleSystemCommand } = require('../../dist/core/src/services/handlers.js');
const { processPhotoReconsideration, startRelatedPhotoWorker } = require('../../dist/core/src/services/relatedPhotos/worker.js');
const { fixture, photo, addSet, confirmDate, dateClaim } = require('./related-photo-network-fixtures.cjs');

async function invoke(manager, eventBus, command, payload) {
    const responses = [];
    const context = { id: `request-${command}`, command, payload, dbManager: manager,
        eventBus, activeJobs: new Map(), LIB_DIR: 'isolated-fixture',
        respond: (...response) => responses.push(response) };
    assert.equal(await handleSystemCommand(context), true);
    assert.equal(responses.length, 1);
    const [id, status, data, error] = responses[0];
    assert.equal(id, context.id);
    return { status, data, error };
}

test('network commands route membership decisions into durable authority and immediate invalidation', async t => {
    const { manager, db } = fixture(t);
    const bus = new EventBus(manager);
    addSet(manager, ['anchor', 'matching']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'verified-anchor');
    const network = await invoke(manager, bus, 'get_photo_evidence_network', { assetId: 'matching' });
    assert.equal(network.status, 'ok');
    assert.equal(network.data.events.length, 1);
    const event = network.data.events[0];
    assert.equal(event.members.length, 2);
    assert.ok(dateClaim(manager, 'matching'));
    const rejected = await invoke(manager, bus, 'record_photo_event_membership', {
        assetId: 'matching', eventId: event.id, disposition: 'rejected', userId: 'fixture-reviewer', note: 'Different occasion',
    });
    assert.equal(rejected.status, 'ok');
    assert.equal(dateClaim(manager, 'matching'), undefined);
    const decision = db.prepare('SELECT disposition,user_id,note FROM photo_event_decisions').get();
    assert.deepEqual(decision, { disposition: 'rejected', user_id: 'fixture-reviewer', note: 'Different occasion' });
    assert.ok(db.prepare("SELECT 1 FROM related_photo_queue WHERE asset_id = 'anchor'").get());
    const confirmed = await invoke(manager, bus, 'record_photo_event_membership', {
        assetId: 'matching', eventId: event.id, disposition: 'confirmed', userId: 'fixture-reviewer',
    });
    assert.equal(confirmed.status, 'ok');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM photo_event_decisions').get().count, 2);
    processPhotoReconsideration(manager, 'matching', 'membership-confirmed');
    assert.equal(dateClaim(manager, 'matching').value.label, 'Christmas 1976');
});

test('claim rejection command records attribution and withdraws dependent inference synchronously', async t => {
    const { manager, db } = fixture(t);
    const bus = new EventBus(manager);
    addSet(manager, ['anchor', 'matching']);
    const anchor = confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'date-anchor');
    const response = await invoke(manager, bus, 'reject_photo_analysis_claim', {
        claimId: anchor.id, userId: 'fixture-reviewer', note: 'Print label was misread',
    });
    assert.equal(response.status, 'ok');
    assert.equal(dateClaim(manager, 'matching'), undefined);
    assert.deepEqual(db.prepare('SELECT claim_id,disposition,user_id,note FROM analysis_claim_decisions').get(), {
        claim_id: anchor.id, disposition: 'rejected', user_id: 'fixture-reviewer', note: 'Print label was misread',
    });
    assert.ok(db.prepare("SELECT 1 FROM related_photo_queue WHERE asset_id = 'matching'").get());
    const repeated = await invoke(manager, bus, 'reject_photo_analysis_claim', { claimId: anchor.id, userId: 'fixture-reviewer' });
    assert.equal(repeated.status, 'error');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_claim_decisions').get().count, 1);
});

test('manual reconsideration coalesces durable work and validates command boundaries', async t => {
    const { manager, db } = fixture(t);
    const bus = new EventBus(manager);
    photo(manager, 'target');
    for (let index = 0; index < 2; index++) {
        const response = await invoke(manager, bus, 'reconsider_photo_evidence', { assetId: 'target' });
        assert.equal(response.status, 'ok');
    }
    const queue = db.prepare('SELECT asset_id,cause,revision,status FROM related_photo_queue').all();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].asset_id, 'target');
    assert.equal(queue[0].cause, 'manual-reconsideration');
    assert.equal(queue[0].revision, 2);
    assert.equal(queue[0].status, 'pending');
    assert.equal((await invoke(manager, bus, 'get_photo_evidence_network', { assetId: '' })).status, 'error');
    assert.equal((await invoke(manager, bus, 'get_archive_impacts', { limit: 101 })).status, 'error');
    assert.equal((await invoke(manager, bus, 'record_photo_event_membership', {
        assetId: 'target', eventId: 'missing', disposition: 'confirmed', userId: ' ',
    })).status, 'error');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM photo_event_decisions').get().count, 0);
});

test('impact command exposes only genuine persisted changes with stable cursors and no historical inventions', async t => {
    const { manager, db } = fixture(t);
    const bus = new EventBus(manager);
    addSet(manager, ['anchor', 'matching']);
    confirmDate(manager, 'anchor');
    const empty = await invoke(manager, bus, 'get_archive_impacts', {});
    assert.deepEqual(empty.data.impacts, []);
    const result = processPhotoReconsideration(manager, 'anchor', 'fixture-new-learning');
    assert.ok(result.impacts.length > 0);
    const first = await invoke(manager, bus, 'get_archive_impacts', { assetId: 'matching', limit: 1 });
    assert.equal(first.status, 'ok');
    assert.equal(first.data.impacts.length, 1);
    assert.equal(first.data.impacts[0].cause, 'fixture-new-learning');
    const rows = db.prepare('SELECT rowid AS cursor,* FROM archive_impacts ORDER BY rowid').all();
    processPhotoReconsideration(manager, 'anchor', 'unchanged-learning');
    assert.deepEqual(db.prepare('SELECT rowid AS cursor,* FROM archive_impacts ORDER BY rowid').all(), rows);
    const after = await invoke(manager, bus, 'get_archive_impacts', { after: first.data.impacts[0].cursor });
    assert.ok(after.data.impacts.every(impact => impact.cursor > first.data.impacts[0].cursor));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workflow_runs').get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE provider <> 'related-photo-network' AND stage NOT IN ('user','scout')").get().count, 0);
});

test('worker event triggers are durable, pause-respecting and never launch paid analysis', async t => {
    const { manager, db } = fixture(t);
    for (const id of ['imported', 'edited', 'faces', 'embedding']) { photo(manager, id); }
    manager.setSetting('system_paused', 'true');
    const bus = new EventBus(manager);
    const stop = startRelatedPhotoWorker(manager, bus);
    t.after(stop);
    bus.emit({ type: 'MediaDiscovered', mediaId: 'imported', filePath: 'fixture.jpg', width: 10, height: 10, scanSessionId: 'fixture-scan' });
    bus.emit({ type: 'AssetUpdated', assetId: 'edited' });
    bus.emit({ type: 'FacesDetected', mediaId: 'faces', faceCount: 1 });
    bus.emit({ type: 'FaceEmbeddingGenerated', mediaId: 'embedding', faceId: 'fixture-face' });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM related_photo_queue').get().count, 4);
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM related_photo_queue').get().count, 4);
    const revision = db.prepare("SELECT revision FROM related_photo_queue WHERE asset_id = 'edited'").get().revision;
    bus.emit({ type: 'AssetUpdated', assetId: 'edited', source: 'related-photo-network' });
    assert.equal(db.prepare("SELECT revision FROM related_photo_queue WHERE asset_id = 'edited'").get().revision, revision);
    manager.setSetting('system_paused', 'false');
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM related_photo_queue').get().count, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workflow_runs').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count, 0);
});

test('worker restart resumes interrupted work and stopping removes its event ownership', t => {
    const { manager, db } = fixture(t);
    photo(manager, 'target');
    manager.setSetting('system_paused', 'true');
    db.prepare("INSERT INTO related_photo_queue(asset_id,cause,revision,status,attempts,updated_at) VALUES ('target','interrupted',1,'running',0,?)")
        .run(new Date().toISOString());
    const bus = new EventBus(manager);
    const stop = startRelatedPhotoWorker(manager, bus);
    assert.equal(db.prepare('SELECT status FROM related_photo_queue').get().status, 'pending');
    stop();
    bus.emit({ type: 'AssetUpdated', assetId: 'target' });
    assert.equal(db.prepare('SELECT revision FROM related_photo_queue').get().revision, 1);
    const stopRestarted = startRelatedPhotoWorker(manager, bus);
    t.after(stopRestarted);
    bus.emit({ type: 'AssetUpdated', assetId: 'target' });
    assert.equal(db.prepare('SELECT revision FROM related_photo_queue').get().revision, 2);
});

test('closing and reopening isolated storage retains real impacts and resumes only interrupted queue items', async t => {
    const directory = mkdtempSync(join(tmpdir(), 'photostar-network-runtime-restart-'));
    let manager = new DatabaseManager(directory);
    let stop;
    t.after(() => { stop?.(); manager.close(); rmSync(directory, { recursive: true, force: true }); });
    addSet(manager, ['anchor', 'matching']);
    confirmDate(manager, 'anchor');
    processPhotoReconsideration(manager, 'anchor', 'persisted-learning');
    manager.setSetting('system_paused', 'true');
    const before = manager.getDb().prepare('SELECT rowid AS cursor,* FROM archive_impacts ORDER BY rowid').all();
    assert.ok(before.length);
    manager.getDb().prepare("UPDATE related_photo_queue SET status = 'running' WHERE asset_id = 'anchor'").run();
    manager.getDb().prepare("UPDATE related_photo_queue SET status = 'failed', error = 'fixture-failure' WHERE asset_id = 'matching'").run();
    manager.close();
    manager = new DatabaseManager(directory);
    const bus = new EventBus(manager);
    stop = startRelatedPhotoWorker(manager, bus);
    assert.equal(manager.getDb().prepare("SELECT status FROM related_photo_queue WHERE asset_id = 'anchor'").get().status, 'pending');
    assert.equal(manager.getDb().prepare("SELECT status FROM related_photo_queue WHERE asset_id = 'matching'").get().status, 'failed');
    const response = await invoke(manager, bus, 'get_archive_impacts', {});
    assert.deepEqual(response.data.impacts, before);
    assert.equal(dateClaim(manager, 'matching').value.label, 'Christmas 1976');
    assert.equal(manager.getDb().prepare('SELECT COUNT(*) AS count FROM workflow_runs').get().count, 0);
});
