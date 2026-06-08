const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');

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
    const { createDetectFramesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFramesModule.js');
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
            parameters: {},
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
    const { createDetectFramesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFramesModule.js');
    let dbManager;

    // Mock InferenceSession.create
    const originalCreate = ort.InferenceSession.create;
    ort.InferenceSession.create = async () => {
        return {
            run: async () => {
                // Mock return value for a 1024x1024 mask output
                const mockMaskData = new Float32Array(1024 * 1024);
                // Set a small circle in the middle to 1
                for (let y = 500; y < 520; y++) {
                    for (let x = 500; x < 520; x++) {
                        mockMaskData[y * 1024 + x] = 1.0;
                    }
                }
                return {
                    masks: {
                        data: mockMaskData,
                        dims: [1, 1, 1024, 1024]
                    }
                };
            }
        };
    };

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES ('asset-2', ?, '2026-03-20T00:00:00.000Z')
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
            runId: 'run-2',
            subject: { subjectType: 'asset', subjectId: 'asset-2' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-2' }],
            parameters: {},
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
        assert.ok(emittedEvents.some((event) => event.type === 'AssetUpdated' && event.assetId === 'asset-2'));
    } finally {
        ort.InferenceSession.create = originalCreate;
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
