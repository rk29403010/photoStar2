const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const Database = require('better-sqlite3');

const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const { EventBus } = require('../../dist/core/src/services/events/bus.js');
const { Coordinator } = require('../../dist/core/src/services/coordinator/index.js');
const { listWorkflowModules } = require('../../dist/core/src/services/coordinator/workflows.js');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-ai-v2-'));
}

function insertAsset(dbManager, assetId) {
    dbManager.getDb().prepare(`
        INSERT INTO assets (id, original_path, width, height)
        VALUES (?, ?, 100, 100)
    `).run(assetId, `C:/tmp/${assetId}.jpg`);
}

function cleanupHarness(harness) {
    harness.dbManager.close();
    const tempDir = harness.tempDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
}

function createHarness({
    moduleIds = ['ai_metadata_v2_pipeline'],
    stageOverrides = {
        ai_metadata_v2_3f: { batchLimit: 1, useHeavyBatching: false },
    },
} = {}) {
    const tempDir = createTempDir();
    const dbManager = new DatabaseManager(tempDir);
    dbManager.setSetting('workflow_modules_json', JSON.stringify(moduleIds));
    dbManager.setSetting('workflow_stage_overrides_json', JSON.stringify(stageOverrides));

    const eventBus = new EventBus(dbManager);
    const requestEvents = [];

    eventBus.subscribe('AiMetadataV2Requested', (event) => {
        requestEvents.push(event);
        eventBus.emit({
            type: 'JobStarted',
            jobId: event.jobId,
            pipelineStage: event.pipelineStage,
            totalItems: event.mediaIds?.length ?? 0,
        });
    });

    const coordinator = new Coordinator(eventBus, dbManager);

    return {
        tempDir,
        dbManager,
        eventBus,
        coordinator,
        requestEvents,
    };
}

function getQueueRows(dbManager) {
    return dbManager.getDb().prepare(`
        SELECT media_id, pipeline_stage, status, claimed_by, last_error
        FROM task_queue
        ORDER BY media_id ASC, pipeline_stage ASC
    `).all();
}

test('workflow modules expose legacy and replacement AI metadata lifecycle metadata', () => {
    const modules = listWorkflowModules();
    const legacy = modules.find((module) => module.id === 'ai_metadata_pipeline');
    const replacement = modules.find((module) => module.id === 'ai_metadata_v2_pipeline');

    assert.ok(legacy, 'expected legacy AI metadata module');
    assert.ok(replacement, 'expected replacement AI metadata module');
    assert.equal(legacy.enabledByDefault, false);
    assert.equal(legacy.status, 'legacy');
    assert.equal(legacy.replacedByModuleId, 'ai_metadata_v2_pipeline');
    assert.equal(replacement.enabledByDefault, true);
    assert.equal(replacement.status, 'active');
    assert.deepEqual(replacement.replacesModuleIds, ['ai_metadata_pipeline']);
    assert.equal(replacement.storageCompatibility, 'reuse_existing_results');
    assert.equal(replacement.monitoringCompatibility, 'merge_legacy_and_replacement');
    assert.equal(replacement.rateLimitStrategy, 'dynamic_tier');
});

test('database manager migrates older task_queue tables before claim indexes are required', () => {
    const tempDir = createTempDir();
    const dbPath = path.join(tempDir, 'library.db');
    const legacyDb = new Database(dbPath);

    legacyDb.exec(`
        CREATE TABLE task_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id TEXT NOT NULL,
            pipeline_stage TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            priority INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(media_id, pipeline_stage)
        );
    `);
    legacyDb.close();

    const dbManager = new DatabaseManager(tempDir);

    try {
        const columns = dbManager.getDb().prepare(`PRAGMA table_info(task_queue)`).all();
        const columnNames = columns.map((column) => column.name);

        assert.ok(columnNames.includes('claimed_by'));
        assert.ok(columnNames.includes('claimed_at'));
        assert.ok(columnNames.includes('last_error'));
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('replacement AI metadata stages fail only rows claimed by the failed batch', async () => {
    const harness = createHarness();

    try {
        await delay(650);
        insertAsset(harness.dbManager, 'asset-1');
        insertAsset(harness.dbManager, 'asset-2');

        harness.eventBus.emit({ type: 'PreviewGenerated', mediaId: 'asset-1', path: 'thumb-1.jpg' });
        harness.eventBus.emit({ type: 'PreviewGenerated', mediaId: 'asset-2', path: 'thumb-2.jpg' });

        await delay(800);

        assert.equal(harness.requestEvents.length, 1, 'expected only the first v2 batch to dispatch');
        const firstRequest = harness.requestEvents[0];
        assert.equal(firstRequest.pipelineStage, 'ai_metadata_v2_3f');
        assert.equal(firstRequest.workerMode, 'fresh');
        assert.deepEqual(firstRequest.mediaIds, ['asset-1']);

        let queueRows = getQueueRows(harness.dbManager);
        assert.deepEqual(queueRows, [
            {
                media_id: 'asset-1',
                pipeline_stage: 'ai_metadata_v2_3f',
                status: 'processing',
                claimed_by: firstRequest.jobId,
                last_error: null,
            },
            {
                media_id: 'asset-2',
                pipeline_stage: 'ai_metadata_v2_3f',
                status: 'pending',
                claimed_by: null,
                last_error: null,
            },
        ]);

        harness.eventBus.emit({
            type: 'JobFailed',
            jobId: firstRequest.jobId,
            pipelineStage: firstRequest.pipelineStage,
            severity: 'fatal',
            reason: 'SIMULATED_BATCH_FAILURE',
        });

        await delay(800);

        assert.equal(harness.requestEvents.length, 2, 'expected the second batch to dispatch after the first failed');
        const secondRequest = harness.requestEvents[1];
        assert.deepEqual(secondRequest.mediaIds, ['asset-2']);

        queueRows = getQueueRows(harness.dbManager);
        assert.deepEqual(queueRows, [
            {
                media_id: 'asset-1',
                pipeline_stage: 'ai_metadata_v2_3f',
                status: 'failed',
                claimed_by: firstRequest.jobId,
                last_error: 'SIMULATED_BATCH_FAILURE',
            },
            {
                media_id: 'asset-2',
                pipeline_stage: 'ai_metadata_v2_3f',
                status: 'processing',
                claimed_by: secondRequest.jobId,
                last_error: null,
            },
        ]);
    } finally {
        cleanupHarness(harness);
    }
});
