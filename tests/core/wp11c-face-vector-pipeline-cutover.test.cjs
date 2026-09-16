const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp11c-cutover-'));
}

function seedExecution(db, assetId) {
    db.prepare(`
        INSERT INTO workflow_runs (
            id, workflow_id, trigger_type, status, input_subjects_json, parameters_json
        ) VALUES ('run-1', 'wp11c-test', 'manual', 'running', ?, '{}')
    `).run(JSON.stringify([{ subjectType: 'asset', subjectId: assetId }]));
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status, expected_items)
        VALUES ('step-1', 'run-1', 'generate-face-vectors', 'running', 1)
    `).run();
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES ('subject-1', 'run-1', 'step-1', 'asset', ?, 'running')
    `).run(assetId);
}

test('WP11c ArcFace production path publishes active generation-owned vectors and the reader ignores legacy JSON ownership', async () => {
    const tempDir = createTempDir();
    const assetPath = path.join(tempDir, 'asset.bin');
    const modelPath = path.join(tempDir, 'arcface-test.onnx');
    fs.writeFileSync(assetPath, Buffer.from('deterministic-image-input'));
    fs.writeFileSync(modelPath, Buffer.from('deterministic-model-artifact'));

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const maskMetadata = await import('../../dist/core/src/services/photoEditing/assetMaskMetadata.js');
    const faceVectors = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-face-vectors/implementation.js');
    const peopleResolution = await import('../../dist/core/src/services/faces/peopleResolution.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, width, height)
            VALUES ('asset-1', ?, 100, 100)
        `).run(assetPath);
        const stable = stableFaces.createStableFaceDetection(db, {
            assetId: 'asset-1',
            sourceAnalysisGenerationId: 'face-detection-1',
            box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
            sourceWidth: 100,
            sourceHeight: 100,
            sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces',
            provider: 'test_detector',
            modelVersion: '1.0',
        });
        maskMetadata.saveAssetMaskMetadata(db, {
            assetId: 'asset-1',
            sourceId: 'runtime.detect_faces',
            masks: [{
                id: 'face-0',
                label: 'Face 1',
                description: 'test face',
                kind: 'ellipse',
                box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
                visualRegionId: stable.visualRegionId,
                source: { moduleId: 'runtime.detect_faces', referenceId: 'face-0' },
            }],
        });
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('face-detection-1', 'asset-1', 'face_detection', 'test_detector', '1.0', ?)
        `).run(JSON.stringify({
            faces: [{
                id: 'transient-detector-face',
                box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
                landmarks: [{ x: 0.3, y: 0.3 }],
            }],
        }));
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('legacy-recognition', 'asset-1', 'face_recognition', 'legacy', '0', ?)
        `).run(JSON.stringify({ embeddings: [[9, 9]] }));
        seedExecution(db, 'asset-1');

        const embeddingService = {
            isAvailable: () => true,
            getModelPath: () => modelPath,
            computeEmbedding: async () => [0.6, 0.8],
        };
        const module = faceVectors.createGenerateFaceVectorsModule({ dbManager, embeddingService });
        await module.run({
            runId: 'run-1',
            stepRunId: 'step-1',
            subjectExecutionId: 'subject-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        const generation = db.prepare(`
            SELECT id, status, scope_key, model_artifact_checksum
            FROM analysis_generations
            WHERE scope_key = 'face-vectors:asset-1'
        `).get();
        assert.equal(generation.status, 'successful');
        assert.match(generation.model_artifact_checksum, /^sha256:[0-9a-f]{64}$/);
        assert.equal(
            db.prepare(`SELECT active_generation_id FROM analysis_generation_heads WHERE scope_key = 'face-vectors:asset-1'`).get().active_generation_id,
            generation.id,
        );

        const vector = db.prepare(`
            SELECT subject_entity_id, feature_key, dimensions, normalization, metric
            FROM feature_vectors
            WHERE analysis_generation_id = ?
        `).get(generation.id);
        assert.deepEqual(vector, {
            subject_entity_id: stable.faceId,
            feature_key: 'face_embedding',
            dimensions: 2,
            normalization: 'none',
            metric: 'cosine',
        });
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM derived_results WHERE task = 'face_recognition'`).get().count, 0);

        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('poisoned-legacy-recognition', 'asset-1', 'face_recognition', 'legacy', '0', ?)
        `).run(JSON.stringify({ embeddings: [[9, 9]] }));
        const recognised = peopleResolution.loadRecognisedFaces(db);
        assert.equal(recognised.length, 1);
        assert.equal(recognised[0].assetId, 'asset-1');
        assert.equal(recognised[0].faceIndex, 0);
        assert.ok(Math.abs(recognised[0].embedding[0] - 0.6) < 1e-6);
        assert.ok(Math.abs(recognised[0].embedding[1] - 0.8) < 1e-6);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
