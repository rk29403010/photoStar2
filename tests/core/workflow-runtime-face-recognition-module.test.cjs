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
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4jwQYcHIAu4cj3WS55GoAAAAASUVORK5CYII=',
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

function seedExecution(db, runId, assetId) {
    const stepRunId = `step-${runId}`;
    const subjectExecutionId = `subject-${runId}`;
    db.prepare(`
        INSERT INTO workflow_runs (
            id, workflow_id, trigger_type, status, input_subjects_json, parameters_json
        ) VALUES (?, 'face-recognition-test', 'manual', 'running', ?, '{}')
    `).run(runId, JSON.stringify([{ subjectType: 'asset', subjectId: assetId }]));
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status, expected_items)
        VALUES (?, ?, 'generate-face-vectors', 'running', 1)
    `).run(stepRunId, runId);
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES (?, ?, ?, 'asset', ?, 'running')
    `).run(subjectExecutionId, runId, stepRunId, assetId);
    return { stepRunId, subjectExecutionId };
}

async function seedStableFace(db, assetId, face) {
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const maskMetadata = await import('../../dist/core/src/services/photoEditing/assetMaskMetadata.js');
    const stable = stableFaces.createStableFaceDetection(db, {
        assetId,
        sourceAnalysisGenerationId: `face-detect-${assetId}`,
        box: face.box,
        sourceWidth: 100,
        sourceHeight: 100,
        sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces',
        provider: 'onnx_retina_10g',
        modelVersion: '1.0',
    });
    maskMetadata.saveAssetMaskMetadata(db, {
        assetId,
        sourceId: 'runtime.detect_faces',
        masks: [{
            id: face.id,
            label: 'Face 1',
            description: 'test face',
            kind: 'ellipse',
            box: face.box,
            visualRegionId: stable.visualRegionId,
            source: { moduleId: 'runtime.detect_faces', referenceId: face.id },
        }],
    });
    return stable;
}

test('runtime.generate_face_vectors stores generation-owned ArcFace embeddings and emits face events', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir);
    const modelPath = path.join(tempDir, 'arcface-test.onnx');
    fs.writeFileSync(modelPath, Buffer.from('deterministic-model-artifact'));
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-face-vectors/implementation.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        const faces = [
            {
                id: 'face-1',
                box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                landmarks: [{ x: 0.2, y: 0.2 }],
            },
            {
                id: 'face-2',
                box: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 },
            },
        ];
        insertAsset(db, 'asset-1', imagePath);
        insertFaceDetection(db, 'asset-1', faces);
        const stable = await seedStableFace(db, 'asset-1', faces[0]);
        const execution = seedExecution(db, 'run-1', 'asset-1');

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
                    return modelPath;
                },
                async computeEmbedding() {
                    return [0.25, 0.5, 0.75];
                },
            },
        });

        const result = await moduleDefinition.run({
            runId: 'run-1',
            ...execution,
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }]);

        const generation = db.prepare(`
            SELECT id, status
            FROM analysis_generations
            WHERE scope_key = 'face-vectors:asset-1'
        `).get();
        assert.equal(generation.status, 'successful');
        const vector = db.prepare(`
            SELECT subject_entity_id, dimensions, normalization, metric
            FROM feature_vectors
            WHERE analysis_generation_id = ?
        `).get(generation.id);
        assert.deepEqual(vector, {
            subject_entity_id: stable.faceId,
            dimensions: 3,
            normalization: 'none',
            metric: 'cosine',
        });
        assert.equal(
            db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE asset_id = 'asset-1' AND task = 'face_recognition'").get().count,
            0,
        );
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
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-face-vectors/implementation.js');
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
        const execution = seedExecution(db, 'run-2', 'asset-1');

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
            ...execution,
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
