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

function seedAsset(db) {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES ('asset-1', 'C:/photos/one.jpg', '2026-03-23T09:00:00.000Z')
    `).run();
}

async function seedAssetWithRepositoryBackedEvidence(dbManager) {
    const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
    const { createPhotoMetadataManualAssertionsService } = await import('../../dist/core/src/services/photoMetadata/manualAssertions.js');
    const { createPhotoMetadataResolver } = await import('../../dist/core/src/services/photoMetadata/resolver.js');
    const repository = createPhotoMetadataRepository({ dbManager });
    const manualAssertions = createPhotoMetadataManualAssertionsService({ dbManager });

    repository.insertMetadataBlock({
        assetId: 'asset-1',
        sourceKind: 'gemini_flash_scout',
        provider: 'google',
        modelVersion: 'gemini-3-flash-preview',
        schemaVersion: 1,
        block: {
            type: 'portrait',
            caption: 'Scout caption',
            description: 'Scout description',
            location: 'Scout location',
            estimated_date: {
                most_likely_date: '1968-12-24T00:00:00.000Z',
                min_date: '1968-12-01T00:00:00.000Z',
                max_date: '1968-12-31T23:59:59.999Z',
                display_label: 'late 1968',
                rationale: 'Scout pass estimate.',
            },
            subjects: [],
            regions_of_interest: [],
            keywords: ['family', 'christmas'],
            emotional_impact: 'Warm',
            quality: { technical: 4, lighting: 4, composition: 4, emotional: 5, discard: false },
            recommended_enhancements: ['Tighten crop'],
            authenticity: { score: 0.82, reasons: ['family context'] },
        },
    });
    repository.insertMetadataBlock({
        assetId: 'asset-1',
        sourceKind: 'gemini_pro_refined',
        provider: 'google',
        modelVersion: 'gemini-3.1-pro-preview',
        schemaVersion: 1,
        block: {
            type: 'portrait',
            caption: 'Refined caption',
            description: 'Refined description',
            location: 'Refined location',
            estimated_date: {
                most_likely_date: '1968-12-25T00:00:00.000Z',
                min_date: '1968-12-24T00:00:00.000Z',
                max_date: '1968-12-26T23:59:59.999Z',
                display_label: 'Christmas 1968',
                rationale: 'Refined pass found the Christmas dinner context.',
            },
            subjects: [],
            regions_of_interest: [],
            keywords: ['family', 'christmas', 'dinner'],
            emotional_impact: 'Warm',
            quality: { technical: 4, lighting: 4, composition: 4, emotional: 5, discard: false },
            recommended_enhancements: ['Tighten crop'],
            authenticity: { score: 0.82, reasons: ['family context'] },
        },
    });

    const manualAssertion = manualAssertions.recordManualAssertion({
        assetId: 'asset-1',
        fieldPath: 'caption',
        value: 'Billy and Dad enjoying Christmas dinner',
        userId: 'user-father-in-law',
        note: 'Family memory confirmed the caption.',
    });

    createPhotoMetadataResolver({ dbManager }).resolvePhotoMetadata('asset-1');
    return { manualAssertion };
}

test('get_asset_detail returns repository-backed evidence when requested', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        seedAsset(dbManager.getDb());
        const ids = await seedAssetWithRepositoryBackedEvidence(dbManager);

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
        assert.equal(response.data.asset.ai_metadata, undefined);
        assert.equal(response.data.asset.photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
        assert.ok(response.data.asset.photo_metadata.evidence);
        assert.equal(response.data.asset.photo_metadata.evidence.machineBlocks.length, 2);
        assert.equal(response.data.asset.photo_metadata.evidence.manualAssertions.length, 1);
        assert.equal(response.data.asset.photo_metadata.evidence.manualAssertions[0].id, ids.manualAssertion.id);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets returns repository-backed evidence for single-photo payloads when requested', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        seedAsset(dbManager.getDb());
        const ids = await seedAssetWithRepositoryBackedEvidence(dbManager);

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
        assert.equal(response.data.assets[0].ai_metadata, undefined);
        assert.equal(response.data.assets[0].photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
        assert.ok(response.data.assets[0].photo_metadata.evidence);
        assert.equal(response.data.assets[0].photo_metadata.evidence.machineBlocks.length, 2);
        assert.equal(response.data.assets[0].photo_metadata.evidence.manualAssertions.length, 1);
        assert.equal(response.data.assets[0].photo_metadata.evidence.manualAssertions[0].id, ids.manualAssertion.id);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
