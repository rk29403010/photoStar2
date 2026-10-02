const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp11a-generations-'));
}

function seedExecution(db, suffix) {
    const workflowRunId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (
            id, workflow_id, trigger_type, status, input_subjects_json, parameters_json
        ) VALUES (?, 'wp11-test', 'manual', 'successful', '[]', '{}')
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

function generationInput(execution, suffix, overrides = {}) {
    return {
        scopeKey: 'face-embedding:asset-1',
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
        ...overrides,
    };
}

test('WP11a analysis generations record provenance and retry idempotently', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const execution = seedExecution(db, 'provenance');
        const input = generationInput(execution, 'provenance');
        const created = generations.startAnalysisGeneration(db, input);

        assert.equal(created.status, 'running');
        assert.equal(created.scopeKey, input.scopeKey);
        assert.equal(created.workflowRunId, input.workflowRunId);
        assert.equal(created.stepRunId, input.stepRunId);
        assert.equal(created.subjectExecutionId, input.subjectExecutionId);
        assert.equal(created.inputFingerprint, input.inputFingerprint);
        assert.equal(created.modelArtifactChecksum, input.modelArtifactChecksum);
        assert.equal(created.preprocessingVersion, input.preprocessingVersion);
        assert.equal(created.configHash, input.configHash);
        assert.equal(created.supersedesGenerationId, null);

        const retry = generations.startAnalysisGeneration(db, input);
        assert.equal(retry.id, created.id);
        assert.equal(
            db.prepare("SELECT COUNT(*) AS count FROM analysis_generations WHERE idempotency_key = ?").get(input.idempotencyKey).count,
            1,
        );
        assert.throws(
            () => generations.startAnalysisGeneration(db, {
                ...input,
                inputFingerprint: 'sha256:different-input',
            }),
            /reused with different provenance/,
        );
        assert.ok(db.prepare(`
            SELECT id FROM schema_migrations
            WHERE id = '20260911_004_analysis_generations'
        `).get());
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('failed and incomplete replacements cannot displace the active successful generation', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const baselineExecution = seedExecution(db, 'baseline');
        const baseline = generations.startAnalysisGeneration(db, generationInput(baselineExecution, 'baseline'));
        generations.markAnalysisGenerationSuccessful(db, baseline.id);
        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, baseline.id);

        const failedExecution = seedExecution(db, 'failed');
        const failed = generations.startAnalysisGeneration(db, generationInput(failedExecution, 'failed'));
        assert.equal(failed.supersedesGenerationId, baseline.id);
        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, baseline.id);
        generations.markAnalysisGenerationFailed(db, failed.id);
        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, baseline.id);

        const replacementExecution = seedExecution(db, 'replacement');
        const replacement = generations.startAnalysisGeneration(db, generationInput(replacementExecution, 'replacement'));
        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, baseline.id);
        generations.markAnalysisGenerationSuccessful(db, replacement.id);

        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, replacement.id);
        assert.equal(generations.getAnalysisGeneration(db, replacement.id).status, 'successful');
        assert.equal(generations.getAnalysisGeneration(db, baseline.id).status, 'superseded');
        assert.equal(generations.getAnalysisGeneration(db, failed.id).status, 'failed');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('a stale concurrent replacement cannot overwrite a newer successful generation', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const baselineExecution = seedExecution(db, 'concurrent-baseline');
        const baseline = generations.startAnalysisGeneration(
            db,
            generationInput(baselineExecution, 'concurrent-baseline'),
        );
        generations.markAnalysisGenerationSuccessful(db, baseline.id);

        const firstExecution = seedExecution(db, 'concurrent-first');
        const secondExecution = seedExecution(db, 'concurrent-second');
        const first = generations.startAnalysisGeneration(db, generationInput(firstExecution, 'concurrent-first'));
        const second = generations.startAnalysisGeneration(db, generationInput(secondExecution, 'concurrent-second'));
        assert.equal(first.supersedesGenerationId, baseline.id);
        assert.equal(second.supersedesGenerationId, baseline.id);

        generations.markAnalysisGenerationSuccessful(db, second.id);
        assert.throws(
            () => generations.markAnalysisGenerationSuccessful(db, first.id),
            /stale because its scope acquired a newer active generation/,
        );
        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, second.id);
        assert.equal(generations.getAnalysisGeneration(db, first.id).status, 'running');

        generations.markAnalysisGenerationFailed(db, first.id);
        assert.equal(generations.getActiveAnalysisGeneration(db, baseline.scopeKey).id, second.id);
        assert.equal(generations.getAnalysisGeneration(db, first.id).status, 'failed');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
