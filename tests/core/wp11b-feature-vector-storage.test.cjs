const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp11b-vectors-'));
}

function seedGeneration(db, generations, suffix) {
    const workflowRunId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (
            id, workflow_id, trigger_type, status, input_subjects_json, parameters_json
        ) VALUES (?, 'wp11-vector-test', 'manual', 'running', '[]', '{}')
    `).run(workflowRunId);
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status)
        VALUES (?, ?, 'generate-vectors', 'running')
    `).run(stepRunId, workflowRunId);
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES (?, ?, ?, 'face', 'face-1', 'running')
    `).run(subjectExecutionId, workflowRunId, stepRunId);
    return generations.startAnalysisGeneration(db, {
        scopeKey: 'arcface:face-1',
        workflowRunId,
        stepRunId,
        subjectExecutionId,
        inputFingerprint: 'sha256:face-input',
        provider: 'onnxruntime',
        modelKey: 'arcface-w600k-r50',
        modelVersion: '1.0.0',
        modelArtifactChecksum: 'sha256:model-artifact',
        preprocessingVersion: 'arcface-112-v1',
        configHash: 'sha256:arcface-config',
        idempotencyKey: `arcface-generation-${suffix}`,
    });
}

function seedFaceEntity(db) {
    db.prepare(`
        INSERT INTO semantic_entities (id, kind, native_id, label)
        VALUES ('face:1', 'face', 'face-1', 'Face 1')
    `).run();
}

test('WP11b valid Float32 little-endian vectors round-trip with generation provenance', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedFaceEntity(db);
        const generation = seedGeneration(db, generations, 'roundtrip');
        const input = {
            subjectEntityId: 'face:1',
            analysisGenerationId: generation.id,
            featureKey: 'face_embedding',
            normalization: 'l2',
            metric: 'cosine',
            values: [0.6, 0.8],
        };

        const stored = vectors.storeFeatureVector(db, input);
        assert.equal(stored.dimensions, 2);
        assert.equal(stored.normalization, 'l2');
        assert.equal(stored.metric, 'cosine');
        assert.ok(Math.abs(stored.values[0] - 0.6) < 1e-6);
        assert.ok(Math.abs(stored.values[1] - 0.8) < 1e-6);
        assert.deepEqual(stored.provenance, {
            inputFingerprint: 'sha256:face-input',
            provider: 'onnxruntime',
            modelKey: 'arcface-w600k-r50',
            modelVersion: '1.0.0',
            modelArtifactChecksum: 'sha256:model-artifact',
            preprocessingVersion: 'arcface-112-v1',
            configHash: 'sha256:arcface-config',
        });

        const raw = db.prepare(`
            SELECT vector_blob FROM feature_vectors WHERE id = ?
        `).get(stored.id).vector_blob;
        assert.equal(raw.length, 8);
        assert.ok(Math.abs(raw.readFloatLE(0) - 0.6) < 1e-6);
        assert.ok(Math.abs(raw.readFloatLE(4) - 0.8) < 1e-6);

        const retry = vectors.storeFeatureVector(db, input);
        assert.equal(retry.id, stored.id);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM feature_vectors').get().count, 1);
        assert.ok(db.prepare(`
            SELECT id FROM schema_migrations WHERE id = '20260911_005_feature_vectors'
        `).get());
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP11b rejects malformed, non-finite, falsely normalized, and conflicting vectors', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedFaceEntity(db);
        const generation = seedGeneration(db, generations, 'validation');
        const base = {
            subjectEntityId: 'face:1',
            analysisGenerationId: generation.id,
            featureKey: 'face_embedding',
            normalization: 'none',
            metric: 'cosine',
        };

        assert.throws(() => vectors.storeFeatureVector(db, { ...base, values: [] }), /at least one dimension/);
        assert.throws(() => vectors.storeFeatureVector(db, { ...base, values: [0.1, Number.NaN] }), /finite values/);
        assert.throws(() => vectors.storeFeatureVector(db, { ...base, values: [0.1, Number.POSITIVE_INFINITY] }), /finite values/);
        assert.throws(
            () => vectors.storeFeatureVector(db, { ...base, normalization: 'l2', values: [1, 1] }),
            /does not have unit length/,
        );

        const stored = vectors.storeFeatureVector(db, { ...base, values: [0.25, 0.5] });
        assert.throws(
            () => vectors.storeFeatureVector(db, { ...base, values: [0.25, 0.75] }),
            /reused with different vector data or metadata/,
        );

        db.prepare('UPDATE feature_vectors SET vector_blob = ? WHERE id = ?').run(Buffer.alloc(4), stored.id);
        assert.throws(
            () => vectors.getFeatureVector(db, 'face:1', generation.id, 'face_embedding'),
            /Malformed feature vector BLOB/,
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP11b feature vectors become immutable when their generation finishes', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedFaceEntity(db);
        const generation = seedGeneration(db, generations, 'immutable');
        generations.markAnalysisGenerationSuccessful(db, generation.id);

        assert.throws(() => vectors.storeFeatureVector(db, {
            subjectEntityId: 'face:1',
            analysisGenerationId: generation.id,
            featureKey: 'face_embedding',
            normalization: 'none',
            metric: 'cosine',
            values: [0.25, 0.5],
        }), /only be written to a running generation/);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
