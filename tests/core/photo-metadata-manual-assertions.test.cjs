const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-photo-metadata-manual-assertions-'));
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
        VALUES ('asset-1', 'C:/photos/family-1968.jpg', '2026-03-27T09:00:00.000Z')
    `).run();
}

function seedMachineProjection(repository) {
    repository.saveProjection({
        assetId: 'asset-1',
        type: 'Family portrait',
        caption: 'Billy and Dad at Christmas',
        description: 'A warm family Christmas dinner with Billy and Dad at the table.',
        location: 'Unknown',
        estimatedDate: {
            most_likely_date: '1968-12-25T00:00:00.000Z',
            min_date: '1968-01-01T00:00:00.000Z',
            max_date: '1968-12-31T23:59:59.999Z',
            display_label: 'late 1968',
            rationale: 'Filename and clothing suggest late 1968.',
        },
        keywords: ['Christmas', 'family'],
        emotionalImpact: 'Warm and celebratory',
        quality: { technical: 4, lighting: 4, composition: 3, emotional: 5, discard: false },
        recommendedEnhancements: ['Crop tighter'],
        authenticity: { score: 0.88, reasons: ['family context'] },
        subjects: [],
        regionsOfInterest: [],
        provenance: {
            type: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            caption: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            description: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            location: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            estimatedDate: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            keywords: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            emotionalImpact: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            quality: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            recommendedEnhancements: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            authenticity: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            subjects: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
            regionsOfInterest: { sourceKind: 'gemini_flash_scout', sourceId: 'block-1' },
        },
    });
}

test('manual assertion service records a sparse field edit and newest assertion wins for that field', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);

        const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
        const { createPhotoMetadataManualAssertionsService } = await import('../../dist/core/src/services/photoMetadata/manualAssertions.js');
        const repository = createPhotoMetadataRepository({ dbManager });
        const service = createPhotoMetadataManualAssertionsService({ dbManager });

        seedMachineProjection(repository);

        const firstAssertion = service.recordManualAssertion({
            assetId: 'asset-1',
            fieldPath: 'caption',
            value: 'Billy and Dad at the Christmas table',
            userId: 'user-father-in-law',
            note: 'Family context confirms this is Christmas dinner.',
        });

        const secondAssertion = service.recordManualAssertion({
            assetId: 'asset-1',
            fieldPath: 'caption',
            value: 'Billy and Dad enjoying Christmas dinner',
            userId: 'user-owner',
        });

        const allAssertions = service.listManualAssertions('asset-1');
        const captionAssertions = service.listManualAssertions('asset-1', 'caption');

        assert.equal(firstAssertion.field_path, 'caption');
        assert.equal(firstAssertion.user_id, 'user-father-in-law');
        assert.equal(firstAssertion.note, 'Family context confirms this is Christmas dinner.');
        assert.equal(secondAssertion.field_path, 'caption');
        assert.equal(secondAssertion.user_id, 'user-owner');
        assert.equal(secondAssertion.note, null);
        assert.equal(allAssertions.length, 2);
        assert.equal(allAssertions[0].id, secondAssertion.id);
        assert.equal(allAssertions[1].id, firstAssertion.id);
        assert.equal(captionAssertions.length, 2);
        assert.equal(captionAssertions[0].id, secondAssertion.id);
        assert.equal(captionAssertions[1].id, firstAssertion.id);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('record_photo_metadata_assertion returns the manual edit while leaving machine-derived fields intact', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);

        const repository = createPhotoMetadataRepository({ dbManager });
        seedMachineProjection(repository);

        handleSystemCommand({
            id: 'cmd-manual-metadata',
            command: 'record_photo_metadata_assertion',
            payload: {
                assetId: 'asset-1',
                fieldPath: 'caption',
                value: 'Billy and Dad enjoying Christmas dinner',
                userId: 'user-father-in-law',
                note: 'Confirmed from family memory.',
            },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(response.data.manualAssertion.field_path, 'caption');
        assert.equal(response.data.manualAssertion.user_id, 'user-father-in-law');
        assert.equal(response.data.manualAssertion.note, 'Confirmed from family memory.');
        assert.equal(response.data.photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
        assert.equal(response.data.photo_metadata.projection.description, 'A warm family Christmas dinner with Billy and Dad at the table.');
        assert.equal(response.data.photo_metadata.provenance.caption.sourceKind, 'manual');
        assert.equal(response.data.photo_metadata.provenance.caption.sourceId, response.data.manualAssertion.id);
        assert.ok(! Object.hasOwn(response.data.photo_metadata, 'evidence'));
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
