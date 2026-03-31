const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-face-recognition-module-'));
}

function createFixtureImage(rootDir) {
    const imagePath = path.join(rootDir, 'one.png');
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(imagePath, pngBytes);
    return imagePath;
}

function insertAsset(db, assetId, imagePath) {
    db.prepare(`
        INSERT INTO assets (id, original_path, width, height)
        VALUES (?, ?, 100, 100)
    `).run(assetId, imagePath);
}

function insertFaceDetection(db, assetId, faces) {
    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'face_detection', 'onnx_retina_10g', '1.0', ?)
    `).run(`face-detect-${assetId}`, assetId, JSON.stringify({ faces }));
}

test('runtime.generate_face_vectors stores ArcFace embeddings and emits face events', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir);
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateFaceVectorsModule.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        insertAsset(db, 'asset-1', imagePath);
        insertFaceDetection(db, 'asset-1', [
            {
                id: 'face-1',
                box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                landmarks: [{ x: 0.2, y: 0.2 }],
            },
            {
                id: 'face-2',
                box: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 },
            },
        ]);

        const moduleDefinition = createGenerateFaceVectorsModule({
            dbManager,
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
            embeddingService: {
                isAvailable() {
                    return true;
                },
                getModelPath() {
                    return 'C:/models/w600k_r50.onnx';
                },
                async computeEmbedding() {
                    return [0.25, 0.5, 0.75];
                },
            },
        });

        const result = await moduleDefinition.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }]);

        const recognitionRow = db.prepare(`
            SELECT provider, model_version, data
            FROM derived_results
            WHERE asset_id = 'asset-1' AND task = 'face_recognition'
        `).get();
        assert.equal(recognitionRow.provider, 'onnx_arcface_r50');
        assert.equal(recognitionRow.model_version, '1.0');
        assert.deepEqual(JSON.parse(recognitionRow.data), {
            embeddings: [[0.25, 0.5, 0.75], null],
        });
        assert.deepEqual(emittedEvents, [{
            type: 'FaceEmbeddingGenerated',
            mediaId: 'asset-1',
            faceId: 'face-1',
        }]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime.generate_face_vectors keeps existing embeddings when ArcFace model is unavailable', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir);
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateFaceVectorsModule.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        insertAsset(db, 'asset-1', imagePath);
        insertFaceDetection(db, 'asset-1', [{
            id: 'face-1',
            box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
            landmarks: [{ x: 0.2, y: 0.2 }],
        }]);
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('existing-row', 'asset-1', 'face_recognition', 'onnx_arcface_r50', '1.0', ?)
        `).run(JSON.stringify({ embeddings: [[0.9, 0.8, 0.7]] }));

        const moduleDefinition = createGenerateFaceVectorsModule({
            dbManager,
            embeddingService: {
                isAvailable() {
                    return false;
                },
                getModelPath() {
                    return null;
                },
                async computeEmbedding() {
                    throw new Error('not reachable');
                },
            },
        });

        await moduleDefinition.run({
            runId: 'run-2',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        const recognitionRow = db.prepare(`
            SELECT provider, model_version, data
            FROM derived_results
            WHERE asset_id = 'asset-1' AND task = 'face_recognition'
        `).get();
        assert.equal(recognitionRow.provider, 'onnx_arcface_r50');
        assert.equal(recognitionRow.model_version, '1.0');
        assert.deepEqual(JSON.parse(recognitionRow.data), { embeddings: [[0.9, 0.8, 0.7]] });

        const issueRow = db.prepare(`
            SELECT task, severity, message
            FROM processing_issues
            WHERE asset_id = 'asset-1' AND task = 'recognition'
        `).get();
        assert.equal(issueRow.task, 'recognition');
        assert.equal(issueRow.severity, 'warning');
        assert.match(issueRow.message, /ArcFace model not found/i);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
