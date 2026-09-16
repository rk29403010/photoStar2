const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp11e-lifecycle-'));
}

function seedExecution(db, suffix) {
    const workflowRunId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (
            id, workflow_id, trigger_type, status, input_subjects_json, parameters_json
        ) VALUES (?, 'wp11e-test', 'manual', 'successful', '[]', '{}')
    `).run(workflowRunId);
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status)
        VALUES (?, ?, 'generate-vectors', 'successful')
    `).run(stepRunId, workflowRunId);
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES (?, ?, ?, 'asset', 'asset-1', 'successful')
    `).run(subjectExecutionId, workflowRunId, stepRunId);
    return { workflowRunId, stepRunId, subjectExecutionId };
}

function generationInput(execution, suffix, scopeKey) {
    return {
        scopeKey,
        workflowRunId: execution.workflowRunId,
        stepRunId: execution.stepRunId,
        subjectExecutionId: execution.subjectExecutionId,
        inputFingerprint: `sha256:input-${suffix}`,
        provider: 'onnxruntime',
        modelKey: 'arcface',
        modelVersion: '1.0.0',
        modelArtifactChecksum: 'sha256:model-1',
        preprocessingVersion: 'arcface-preprocess-v1',
        configHash: 'sha256:config-1',
        idempotencyKey: `generation-${suffix}`,
    };
}

function startGeneration(db, generations, suffix, scopeKey) {
    return generations.startAnalysisGeneration(
        db,
        generationInput(seedExecution(db, suffix), suffix, scopeKey),
    );
}

function storeVector(db, vectors, subjectEntityId, generationId, value) {
    return vectors.storeFeatureVector(db, {
        subjectEntityId,
        analysisGenerationId: generationId,
        featureKey: 'face_embedding',
        normalization: 'none',
        metric: 'cosine',
        values: [value, 1 - value],
    });
}

function completeGeneration(db, generations, vectors, subjectEntityId, suffix, scopeKey, value) {
    const generation = startGeneration(db, generations, suffix, scopeKey);
    storeVector(db, vectors, subjectEntityId, generation.id, value);
    generations.markAnalysisGenerationSuccessful(db, generation.id);
    return generation;
}

test('WP11e retries vector writes idempotently and compacts only unprotected stale BLOBs', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const maintenance = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationMaintenance.js');
    const semantics = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const faceEntityId = semantics.ensureSemanticEntity(db, {
            kind: 'face',
            nativeId: 'wp11e-face',
        });

        const retryScope = 'face-vectors:retry';
        const retryExecution = seedExecution(db, 'retry');
        const retryInput = generationInput(retryExecution, 'retry', retryScope);
        const retryGeneration = generations.startAnalysisGeneration(db, retryInput);
        const firstVector = storeVector(db, vectors, faceEntityId, retryGeneration.id, 0.25);
        const retriedGeneration = generations.startAnalysisGeneration(db, retryInput);
        const retriedVector = storeVector(db, vectors, faceEntityId, retriedGeneration.id, 0.25);
        assert.equal(retriedGeneration.id, retryGeneration.id);
        assert.equal(retriedVector.id, firstVector.id);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM feature_vectors
            WHERE analysis_generation_id = ?
        `).get(retryGeneration.id).count, 1);

        const protectedScope = 'face-vectors:human-evidence';
        const evidenceGeneration = completeGeneration(
            db, generations, vectors, faceEntityId, 'evidence-1', protectedScope, 0.31,
        );
        const previousGeneration = completeGeneration(
            db, generations, vectors, faceEntityId, 'evidence-2', protectedScope, 0.32,
        );
        const activeGeneration = completeGeneration(
            db, generations, vectors, faceEntityId, 'evidence-3', protectedScope, 0.33,
        );
        const failedGeneration = startGeneration(db, generations, 'failed', protectedScope);
        storeVector(db, vectors, faceEntityId, failedGeneration.id, 0.34);
        generations.markAnalysisGenerationFailed(db, failedGeneration.id);

        const propositionId = semantics.putSemanticProposition(db, {
            scopeKey: 'wp11e:human-evidence',
            subjectEntityId: faceEntityId,
            predicate: 'retains_analysis_evidence',
            object: { type: 'value', valueType: 'string', value: 'reviewed' },
        });
        const attestationId = semantics.addSemanticAttestation(db, {
            propositionId,
            stance: 'support',
            sourceKind: 'human',
            sourceIdentity: 'tester',
            evidence: [{
                kind: 'analysis_generation',
                ref: { generationId: evidenceGeneration.id },
                label: 'Reviewed machine evidence',
            }],
        });

        const compactableScope = 'face-vectors:compactable';
        const compactableGeneration = completeGeneration(
            db, generations, vectors, faceEntityId, 'compact-1', compactableScope, 0.41,
        );
        const compactablePrevious = completeGeneration(
            db, generations, vectors, faceEntityId, 'compact-2', compactableScope, 0.42,
        );
        const compactableActive = completeGeneration(
            db, generations, vectors, faceEntityId, 'compact-3', compactableScope, 0.43,
        );

        const result = maintenance.compactAnalysisGenerationVectors(db, {
            completedBefore: '2100-01-01T00:00:00.000Z',
        });

        assert.deepEqual(
            new Set(result.compactedGenerationIds),
            new Set([failedGeneration.id, compactableGeneration.id]),
        );
        assert.equal(result.deletedVectorCount, 2);

        for (const generationId of [
            evidenceGeneration.id,
            previousGeneration.id,
            activeGeneration.id,
            compactablePrevious.id,
            compactableActive.id,
            retryGeneration.id,
        ]) {
            assert.equal(db.prepare(`
                SELECT COUNT(*) AS count FROM feature_vectors WHERE analysis_generation_id = ?
            `).get(generationId).count, 1, `expected retained vector for ${generationId}`);
        }
        for (const generationId of [failedGeneration.id, compactableGeneration.id]) {
            assert.equal(db.prepare(`
                SELECT COUNT(*) AS count FROM feature_vectors WHERE analysis_generation_id = ?
            `).get(generationId).count, 0, `expected compacted vector for ${generationId}`);
            assert.ok(generations.getAnalysisGeneration(db, generationId), 'generation metadata must survive compaction');
        }

        const evidenceRows = semantics.getSemanticEvidenceForAttestation(db, attestationId);
        assert.equal(evidenceRows.length, 1);
        assert.equal(evidenceRows[0].kind, 'analysis_generation');
        assert.deepEqual(evidenceRows[0].ref, { generationId: evidenceGeneration.id });
        assert.equal(generations.getActiveAnalysisGeneration(db, protectedScope).id, activeGeneration.id);
        assert.equal(generations.getActiveAnalysisGeneration(db, compactableScope).id, compactableActive.id);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
