const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp11d-retrieval-'));
}

function seedExecution(db, suffix, subjectId) {
    const runId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_type, status, input_subjects_json, parameters_json)
        VALUES (?, 'wp11d-test', 'manual', 'running', '[]', '{}')
    `).run(runId);
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status)
        VALUES (?, ?, 'generate-vectors', 'running')
    `).run(stepRunId, runId);
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES (?, ?, ?, 'face', ?, 'running')
    `).run(subjectExecutionId, runId, stepRunId, subjectId);
    return { runId, stepRunId, subjectExecutionId };
}

function seedFaceEntity(db, id) {
    db.prepare(`
        INSERT INTO semantic_entities (id, kind, native_id, label)
        VALUES (?, 'face', ?, ?)
    `).run(id, id, id);
}

function seedActiveVector(db, generations, vectors, input) {
    seedFaceEntity(db, input.subjectEntityId);
    const execution = seedExecution(db, input.suffix, input.subjectEntityId);
    const generation = generations.startAnalysisGeneration(db, {
        scopeKey: `face-vectors:${input.suffix}`,
        workflowRunId: execution.runId,
        stepRunId: execution.stepRunId,
        subjectExecutionId: execution.subjectExecutionId,
        inputFingerprint: `input:${input.suffix}`,
        provider: 'onnxruntime',
        modelKey: 'arcface-w600k-r50',
        modelVersion: input.modelVersion ?? '1.0.0',
        modelArtifactChecksum: 'sha256:model',
        preprocessingVersion: 'arcface-112-v1',
        configHash: 'sha256:config',
        idempotencyKey: `generation:${input.suffix}`,
    });
    vectors.storeFeatureVector(db, {
        subjectEntityId: input.subjectEntityId,
        analysisGenerationId: generation.id,
        featureKey: 'face_embedding',
        normalization: 'l2',
        metric: 'cosine',
        values: input.values,
    });
    generations.markAnalysisGenerationSuccessful(db, generation.id);
    return generation;
}

test('WP11d retrieves only active compatible vectors and ranks bounded candidates', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const retrieval = await import('../../dist/core/src/services/machineAnalysis/featureVectorRetrieval.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const source = seedActiveVector(db, generations, vectors, {
            suffix: 'source', subjectEntityId: 'face:source', values: [1, 0],
        });
        seedActiveVector(db, generations, vectors, {
            suffix: 'near', subjectEntityId: 'face:near', values: [0.8, 0.6],
        });
        seedActiveVector(db, generations, vectors, {
            suffix: 'far', subjectEntityId: 'face:far', values: [0, 1],
        });
        seedActiveVector(db, generations, vectors, {
            suffix: 'other-model', subjectEntityId: 'face:other-model', values: [1, 0], modelVersion: '2.0.0',
        });

        assert.deepEqual(retrieval.getActiveFeatureVector(db, 'face:source', 'face_embedding'), {
            subjectEntityId: 'face:source',
            analysisGenerationId: source.id,
            dimensions: 2,
            normalization: 'l2',
            metric: 'cosine',
            values: [1, 0],
        });

        const activeIds = [...retrieval.iterateActiveFeatureVectors(db, 'face_embedding')]
            .map((vector) => vector.subjectEntityId);
        assert.deepEqual(activeIds, ['face:far', 'face:near', 'face:other-model', 'face:source']);

        const candidates = retrieval.findActiveFeatureVectorCandidates(db, {
            subjectEntityId: 'face:source',
            featureKey: 'face_embedding',
            limit: 2,
        });
        assert.deepEqual(candidates.map((candidate) => candidate.subjectEntityId), ['face:near', 'face:far']);
        assert.ok(Math.abs(candidates[0].distance - 0.2) < 1e-6);
        assert.ok(Math.abs(candidates[1].distance - 1) < 1e-6);
        assert.throws(
            () => retrieval.findActiveFeatureVectorCandidates(db, {
                subjectEntityId: 'face:source', featureKey: 'face_embedding', limit: 0,
            }),
            /limit must be an integer between 1 and 1000/,
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
