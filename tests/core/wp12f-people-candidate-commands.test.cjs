const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12f-'));
}

function commandContext(dbManager, payload) {
    let response = null;
    return {
        ctx: {
            id: 'wp12f-command', payload, originWs: undefined, dbManager,
            eventBus: { emit() {} },
            respond(_id, status, data, error) { response = { status, data, error }; },
        },
        response: () => response,
    };
}

function seedGeneration(db, generations, suffix, faceId) {
    const runId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_type, status, input_subjects_json, parameters_json)
        VALUES (?, 'wp12f-test', 'manual', 'running', '[]', '{}')
    `).run(runId);
    db.prepare(`INSERT INTO step_runs (id, workflow_run_id, node_id, status) VALUES (?, ?, 'vectors', 'running')`)
        .run(stepRunId, runId);
    db.prepare(`
        INSERT INTO subject_executions (id, workflow_run_id, step_run_id, subject_type, subject_id, status)
        VALUES (?, ?, ?, 'face', ?, 'running')
    `).run(subjectExecutionId, runId, stepRunId, faceId);
    const generation = generations.startAnalysisGeneration(db, {
        scopeKey: `face-vectors:${suffix}`,
        workflowRunId: runId,
        stepRunId,
        subjectExecutionId,
        inputFingerprint: `input:${suffix}`,
        provider: 'onnxruntime',
        modelKey: 'arcface-w600k-r50',
        modelVersion: '1.0.0',
        modelArtifactChecksum: 'sha256:model',
        preprocessingVersion: 'arcface-112-v1',
        configHash: 'sha256:config',
        idempotencyKey: `generation:${suffix}`,
    });
    generations.markAnalysisGenerationSuccessful(db, generation.id);
    return generation.id;
}

async function seedCandidate(db, suffix = 'candidate') {
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const candidateRepository = await import('../../dist/core/src/services/faces/facePersonCandidateRepository.js');
    db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-a', 'C:/candidate.jpg')").run();
    db.prepare("INSERT INTO people (id, name) VALUES ('person-a', 'Alice')").run();
    const face = stableFaces.createStableFaceDetection(db, {
        assetId: 'asset-a', sourceAnalysisGenerationId: 'detect-a',
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        sourceWidth: 100, sourceHeight: 100, sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces', provider: 'test', modelVersion: '1',
    });
    const generationId = seedGeneration(db, generations, suffix, face.faceId);
    candidateRepository.replaceFacePersonCandidates(db, [{
        faceId: face.faceId,
        personId: 'person-a',
        sourceAnalysisGenerationId: generationId,
        anchorFaceId: face.faceId,
        anchorAnalysisGenerationId: generationId,
        rawCosine: 0.8134,
        rank: 1,
        runnerUpScore: 0.62,
        winnerMargin: 0.1934,
        modelKey: 'arcface-w600k-r50',
        modelVersion: '1.0.0',
        preprocessingVersion: 'arcface-112-v1',
        configHash: 'sha256:config',
        decisionStatus: null,
        reviewEligible: true,
        autoActionEligible: false,
    }]);
    return face;
}

test('WP12f candidate payload uses stable Face evidence and raw cosine metadata', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { peopleCandidateCommandHandlers } = await import('../../dist/core/src/services/handlers/peopleCandidateCommands.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const face = await seedCandidate(db);
        const request = commandContext(dbManager, { personId: 'person-a' });
        peopleCandidateCommandHandlers.get_person_face_candidates(request.ctx);
        assert.equal(request.response().status, 'ok');
        assert.equal(request.response().data.assignments.length, 1);
        assert.deepEqual(request.response().data.assignments[0], {
            asset_id: 'asset-a',
            face_id: face.faceId,
            visual_region_id: face.visualRegionId,
            confidence: 0.8134,
            is_suggested: 1,
            original_path: 'C:/candidate.jpg',
            preview_path: null,
            candidate_rank: 1,
            runner_up_score: 0.62,
            winner_margin: 0.1934,
            model_key: 'arcface-w600k-r50',
            model_version: '1.0.0',
        });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12f candidate approval records durable Person truth and removes candidate from review', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { peopleCandidateCommandHandlers } = await import('../../dist/core/src/services/handlers/peopleCandidateCommands.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const face = await seedCandidate(db, 'approve');
        const request = commandContext(dbManager, { faceId: face.faceId, personId: 'person-a' });
        peopleCandidateCommandHandlers.confirm_face_person_candidate(request.ctx);
        assert.equal(request.response().status, 'ok');
        assert.equal(db.prepare("SELECT lifecycle_status FROM people WHERE id = 'person-a'").get().lifecycle_status, 'confirmed');
        assert.deepEqual(
            db.prepare('SELECT decision_status, review_eligible FROM face_person_candidates WHERE face_id = ?').get(face.faceId),
            { decision_status: 'accepted', review_eligible: 0 },
        );
        const decision = db.prepare(`
            SELECT d.status
            FROM semantic_decisions d
            JOIN semantic_propositions p ON p.id = d.proposition_id
            WHERE d.is_current = 1 AND p.subject_entity_id = ? AND p.predicate = 'depicts'
        `).get(face.faceId);
        assert.equal(decision.status, 'accepted');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12f candidate rejection remains explicit durable negative evidence', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { peopleCandidateCommandHandlers } = await import('../../dist/core/src/services/handlers/peopleCandidateCommands.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const face = await seedCandidate(db, 'reject');
        const request = commandContext(dbManager, { faceId: face.faceId, personId: 'person-a' });
        peopleCandidateCommandHandlers.reject_face_person_candidate(request.ctx);
        assert.equal(request.response().status, 'ok');
        assert.deepEqual(
            db.prepare('SELECT decision_status, review_eligible FROM face_person_candidates WHERE face_id = ?').get(face.faceId),
            { decision_status: 'rejected', review_eligible: 0 },
        );
        const decision = db.prepare(`
            SELECT d.status
            FROM semantic_decisions d
            JOIN semantic_propositions p ON p.id = d.proposition_id
            WHERE d.is_current = 1 AND p.subject_entity_id = ? AND p.predicate = 'depicts'
        `).get(face.faceId);
        assert.equal(decision.status, 'rejected');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
