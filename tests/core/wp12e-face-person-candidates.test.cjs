const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12e-candidates-'));
}

function seedExecution(db, suffix, faceId) {
    const runId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_type, status, input_subjects_json, parameters_json)
        VALUES (?, 'wp12e-test', 'manual', 'running', '[]', '{}')
    `).run(runId);
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status)
        VALUES (?, ?, 'generate-vectors', 'running')
    `).run(stepRunId, runId);
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES (?, ?, ?, 'face', ?, 'running')
    `).run(subjectExecutionId, runId, stepRunId, faceId);
    return { runId, stepRunId, subjectExecutionId };
}

function seedActiveVector(db, generations, vectors, faceId, suffix, values) {
    const execution = seedExecution(db, suffix, faceId);
    const generation = generations.startAnalysisGeneration(db, {
        scopeKey: `face-vectors:${suffix}`,
        workflowRunId: execution.runId,
        stepRunId: execution.stepRunId,
        subjectExecutionId: execution.subjectExecutionId,
        inputFingerprint: `input:${suffix}`,
        provider: 'onnxruntime',
        modelKey: 'arcface-w600k-r50',
        modelVersion: '1.0.0',
        modelArtifactChecksum: 'sha256:model',
        preprocessingVersion: 'arcface-112-v1',
        configHash: 'sha256:config',
        idempotencyKey: `generation:${suffix}`,
    });
    vectors.storeFeatureVector(db, {
        subjectEntityId: faceId,
        analysisGenerationId: generation.id,
        featureKey: 'face_embedding',
        normalization: 'l2',
        metric: 'cosine',
        values,
    });
    generations.markAnalysisGenerationSuccessful(db, generation.id);
    return generation;
}

function seedStableFace(db, stableFaces, suffix, x) {
    const assetId = `asset-${suffix}`;
    db.prepare('INSERT INTO assets (id, original_path) VALUES (?, ?)')
        .run(assetId, `C:/faces/${suffix}.jpg`);
    return stableFaces.createStableFaceDetection(db, {
        assetId,
        sourceAnalysisGenerationId: `detection-${suffix}`,
        box: { x, y: 0.1, width: 0.2, height: 0.2 },
        sourceWidth: 100,
        sourceHeight: 100,
        sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces',
        provider: 'test',
        modelVersion: '1',
    });
}

function recordDecision(db, semantic, predicates, faceId, personId, status) {
    const personEntityId = semantic.ensureSemanticEntity(db, {
        kind: 'person', nativeId: personId, label: personId,
    });
    const predicate = predicates.getSemanticPredicateManifest('depicts');
    const propositionId = semantic.putSemanticProposition(db, {
        scopeKey: `${faceId}:depicts`,
        subjectEntityId: faceId,
        predicate: predicate.key,
        object: { type: 'entity', entityId: personEntityId },
    });
    return semantic.recordSemanticDecision(db, {
        scopeKey: `${faceId}:depicts`,
        status,
        propositionId,
        sourceKind: 'human',
        sourceRef: 'test.wp12e',
    });
}

test('WP12e retains weak top-N candidate evidence with runner-up, margin and generation provenance', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const predicates = await import('../../dist/core/src/services/relationships/predicates/registry.js');
    const candidates = await import('../../dist/core/src/services/faces/facePersonCandidateRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('person-a', 'A'), ('person-b', 'B')").run();
        const anchorA = seedStableFace(db, stableFaces, 'anchor-a', 0.1);
        const anchorB = seedStableFace(db, stableFaces, 'anchor-b', 0.2);
        const source = seedStableFace(db, stableFaces, 'source', 0.3);
        seedActiveVector(db, generations, vectors, anchorA.faceId, 'anchor-a', [0.8, 0.6]);
        seedActiveVector(db, generations, vectors, anchorB.faceId, 'anchor-b', [0.6, 0.8]);
        const sourceGeneration = seedActiveVector(db, generations, vectors, source.faceId, 'source', [1, 0]);
        recordDecision(db, semantic, predicates, anchorA.faceId, 'person-a', 'accepted');
        recordDecision(db, semantic, predicates, anchorB.faceId, 'person-b', 'accepted');

        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_evidence_retention_floor', '0.5')").run();
        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_review_threshold', '0.7')").run();
        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_auto_action_threshold', '0.9')").run();
        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_minimum_winner_margin', '0.25')").run();
        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_count', '2')").run();

        candidates.rebuildFacePersonCandidates(dbManager);
        const rows = db.prepare(`
            SELECT person_id, raw_cosine, rank, runner_up_score, winner_margin,
                   source_analysis_generation_id, model_key, model_version,
                   review_eligible, auto_action_eligible, decision_status
            FROM face_person_candidates
            WHERE face_id = ?
            ORDER BY rank
        `).all(source.faceId);

        assert.equal(rows.length, 2);
        assert.equal(rows[0].person_id, 'person-a');
        assert.ok(Math.abs(rows[0].raw_cosine - 0.8) < 1e-6);
        assert.equal(rows[0].rank, 1);
        assert.ok(Math.abs(rows[0].runner_up_score - 0.6) < 1e-6);
        assert.ok(Math.abs(rows[0].winner_margin - 0.2) < 1e-6);
        assert.equal(rows[0].source_analysis_generation_id, sourceGeneration.id);
        assert.equal(rows[0].model_key, 'arcface-w600k-r50');
        assert.equal(rows[0].model_version, '1.0.0');
        assert.equal(rows[0].review_eligible, 1);
        assert.equal(rows[0].auto_action_eligible, 0);
        assert.equal(rows[0].decision_status, null);

        assert.equal(rows[1].person_id, 'person-b');
        assert.ok(Math.abs(rows[1].raw_cosine - 0.6) < 1e-6);
        assert.equal(rows[1].rank, 2);
        assert.equal(rows[1].review_eligible, 0);
        assert.equal(rows[1].auto_action_eligible, 0);
        assert.ok(db.prepare(`
            SELECT id FROM schema_migrations WHERE id = '20260912_003_face_person_candidates'
        `).get());
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12e explicit accepted/rejected decisions remain separate from score policy', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const generations = await import('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const vectors = await import('../../dist/core/src/services/machineAnalysis/featureVectorRepository.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const predicates = await import('../../dist/core/src/services/relationships/predicates/registry.js');
    const candidates = await import('../../dist/core/src/services/faces/facePersonCandidateRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('person-a', 'A')").run();
        const anchor = seedStableFace(db, stableFaces, 'accepted-anchor', 0.1);
        const source = seedStableFace(db, stableFaces, 'rejected-source', 0.2);
        seedActiveVector(db, generations, vectors, anchor.faceId, 'accepted-anchor', [1, 0]);
        seedActiveVector(db, generations, vectors, source.faceId, 'rejected-source', [1, 0]);
        recordDecision(db, semantic, predicates, anchor.faceId, 'person-a', 'accepted');
        recordDecision(db, semantic, predicates, source.faceId, 'person-a', 'rejected');

        candidates.rebuildFacePersonCandidates(dbManager);
        const accepted = db.prepare(`
            SELECT decision_status, raw_cosine, review_eligible, auto_action_eligible
            FROM face_person_candidates WHERE face_id = ? AND person_id = 'person-a'
        `).get(anchor.faceId);
        const rejected = db.prepare(`
            SELECT decision_status, raw_cosine, review_eligible, auto_action_eligible
            FROM face_person_candidates WHERE face_id = ? AND person_id = 'person-a'
        `).get(source.faceId);

        assert.equal(accepted.decision_status, 'accepted');
        assert.equal(accepted.raw_cosine, 1);
        assert.equal(accepted.review_eligible, 0);
        assert.equal(accepted.auto_action_eligible, 0);
        assert.equal(rejected.decision_status, 'rejected');
        assert.equal(rejected.raw_cosine, 1);
        assert.equal(rejected.review_eligible, 0);
        assert.equal(rejected.auto_action_eligible, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12e candidate policy rejects collapsed or invalid threshold configuration', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const candidates = await import('../../dist/core/src/services/faces/facePersonCandidateRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_evidence_retention_floor', '0.8')").run();
        db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('face_candidate_review_threshold', '0.6')").run();
        assert.throws(() => candidates.getFaceCandidatePolicy(dbManager), /evidence <= review <= auto-action/);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
