const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-detect-frames-module-'));
}

async function createBorderedImage(rootDir) {
    const imagePath = path.join(rootDir, 'bordered.png');
    await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
        }
    })
    .extend({
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
        background: { r: 0, g: 0, b: 0 }
    })
    .png()
    .toFile(imagePath);
    return imagePath;
}

async function createSolidImage(rootDir) {
    const imagePath = path.join(rootDir, 'solid.png');
    await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
        }
    })
    .png()
    .toFile(imagePath);
    return imagePath;
}

test('detectFramesModule run - Fast Path (rectangular border)', async () => {
    const tempDir = createTempDir();
    const imagePath = await createBorderedImage(tempDir);
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createDetectFramesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-frames/implementation.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES ('asset-1', ?, '2026-03-20T00:00:00.000Z')
        `).run(imagePath);

        const moduleDefinition = createDetectFramesModule({
            dbManager,
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
        });

        const result = await moduleDefinition.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: { mode: 'quick' },
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }]);

        const derivedRow = db.prepare(`
            SELECT data
            FROM derived_results
            WHERE asset_id = 'asset-1' AND task = 'frame_detection'
        `).get();
        assert.ok(derivedRow);
        const stored = JSON.parse(derivedRow.data);
        assert.equal(stored.type, 'rectangle');
        assert.ok(stored.box);
        const maskMetadataRow = db.prepare(`
            SELECT data FROM asset_mask_metadata
            WHERE asset_id = 'asset-1' AND source_id = 'runtime.detect_frame'
        `).get();
        assert.ok(maskMetadataRow);
        const maskMetadata = JSON.parse(maskMetadataRow.data);
        assert.equal(maskMetadata.schemaVersion, 1);
        assert.equal(maskMetadata.masks[0].label, 'Detected photo area');
        assert.equal(maskMetadata.masks[1].inverted, true);
        assert.ok(emittedEvents.some((event) => event.type === 'AssetUpdated' && event.assetId === 'asset-1'));
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('detectFramesModule run - Deep Path (segmentation fallback)', async () => {
    const tempDir = createTempDir();
    const imagePath = await createSolidImage(tempDir);
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createDetectFramesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-frames/implementation.js');
    let dbManager;

    const provider = { id: 'fastsam', modelId: 'test', modelVersion: '1', capabilities: {}, isAvailable: () => true, prepare: async (image) => ({ providerId: 'fastsam', image, dispose: async () => {} }), segment: async () => { const alpha = new Uint8Array(1024 * 1024); for (let y = 300; y < 700; y += 1) { for (let x = 300; x < 700; x += 1) { alpha[y * 1024 + x] = 255; } } return [{ alpha, width: 1024, height: 1024, box: { x: 300 / 1024, y: 300 / 1024, width: 400 / 1024, height: 400 / 1024 } }]; }, automaticCandidates: async () => [], dispose: async () => {} };

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES ('asset-2', ?, '2026-03-20T00:00:00.000Z')
        `).run(imagePath);

        const moduleDefinition = createDetectFramesModule({
            dbManager,
            providers: [provider],
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
        });

        const result = await moduleDefinition.run({
            runId: 'run-2',
            subject: { subjectType: 'asset', subjectId: 'asset-2' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-2' }],
            parameters: { mode: 'deep' },
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }]);

        const derivedRow = db.prepare(`
            SELECT data
            FROM derived_results
            WHERE asset_id = 'asset-2' AND task = 'frame_detection'
        `).get();
        assert.ok(derivedRow);
        const stored = JSON.parse(derivedRow.data);
        assert.equal(stored.type, 'polygon');
        assert.ok(stored.points.length > 0);
        const maskMetadataRow = db.prepare(`
            SELECT data FROM asset_mask_metadata
            WHERE asset_id = 'asset-2' AND source_id = 'runtime.detect_frame'
        `).get();
        const maskMetadata = JSON.parse(maskMetadataRow.data);
        assert.equal(maskMetadata.masks[0].kind, 'raster');
        assert.ok(maskMetadata.masks[0].raster.pngBase64.length > 0);
        assert.ok(emittedEvents.some((event) => event.type === 'AssetUpdated' && event.assetId === 'asset-2'));
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('detectFramesModule fails the module when its requested model is unavailable', async () => {
    const tempDir = createTempDir();
    const imagePath = await createSolidImage(tempDir);
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createDetectFramesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-frames/implementation.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path, created_at) VALUES ('asset-missing-model', ?, '2026-03-20T00:00:00.000Z')").run(imagePath);
        const moduleDefinition = createDetectFramesModule({
            dbManager,
            providers: [{ id: 'fastsam', modelId: 'test', modelVersion: '1', capabilities: {}, isAvailable: () => false }],
        });

        await assert.rejects(
            moduleDefinition.run({ runId: 'run-missing-model', subject: { subjectType: 'asset', subjectId: 'asset-missing-model' }, batchSubjects: [], parameters: { mode: 'deep', provider: 'fastsam' } }),
            /No verified segmentation provider is available/,
        );
        assert.equal(db.prepare("SELECT severity FROM processing_issues WHERE asset_id = 'asset-missing-model' AND task = 'frame_detection'").get().severity, 'error');
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
