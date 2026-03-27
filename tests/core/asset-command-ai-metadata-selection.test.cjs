const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-asset-command-ai-metadata-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond(id, status, data, error) {
            responses.push({ id, status, data, error });
        },
        takeLast() {
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a response');
            }
            return response;
        },
    };
}

function seedAssetWithDuplicateAiMetadata(db) {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES ('asset-1', 'C:/photos/one.jpg', '2026-03-23T09:00:00.000Z')
    `).run();

    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data, created_at)
        VALUES
            ('ai-old', 'asset-1', 'ai_metadata', 'google', 'gemini-older', '{}', '2026-03-23T09:00:00.000Z'),
            ('ai-new', 'asset-1', 'ai_metadata', 'google', 'gemini-newer', '{"caption":"Enhanced caption","tags":["enhanced"]}', '2026-03-23T09:05:00.000Z')
    `).run();
}

test('get_asset_detail prefers the newest ai metadata row when duplicates exist', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        seedAssetWithDuplicateAiMetadata(dbManager.getDb());

        handleSystemCommand({
            id: 'cmd-asset-detail',
            command: 'get_asset_detail',
            payload: { assetId: 'asset-1', includeEvidence: true },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(response.data.asset.ai_metadata?.caption, 'Enhanced caption');
        assert.deepEqual(response.data.asset.ai_metadata?.tags, ['enhanced']);
        assert.ok(response.data.asset.photo_metadata.evidence);
        assert.equal(response.data.asset.photo_metadata.evidence.machineBlocks.length, 1);
        assert.equal(response.data.asset.photo_metadata.evidence.manualAssertions.length, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets keeps the newest ai metadata row for single-photo payloads when duplicates exist', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        seedAssetWithDuplicateAiMetadata(dbManager.getDb());

        handleSystemCommand({
            id: 'cmd-assets',
            command: 'get_assets',
            payload: { limit: 10, offset: 0, detailLevel: 'full', withGroupCounts: false, includeEvidence: true },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(response.data.assets.length, 1);
        assert.equal(response.data.assets[0].ai_metadata?.caption, 'Enhanced caption');
        assert.deepEqual(response.data.assets[0].ai_metadata?.tags, ['enhanced']);
        assert.ok(response.data.assets[0].photo_metadata.evidence);
        assert.equal(response.data.assets[0].photo_metadata.evidence.machineBlocks.length, 1);
        assert.equal(response.data.assets[0].photo_metadata.evidence.manualAssertions.length, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
