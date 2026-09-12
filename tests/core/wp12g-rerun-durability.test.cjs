const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12g-rerun-'));
}

function seedExecution(db, suffix, faceId) {
    const runId = `run-${suffix}`;
    const stepRunId = `step-${suffix}`;
    const subjectExecutionId = `subject-${suffix}`;
    db.prepare(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_type, status, input_subjects_json, parameters_json)
        VALUES (?, 'wp12g-test', 'manual', 'running', '[]', '{}')
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
        sourceRef: 'test.wp12g',
    });
}

test('WP12g empty machine rerun rebuilds clusters without deleting a confirmed Person', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const clusters = await import('../../dist/core/src/services/faces/identityClusterRepository.js');
    const resolution = await import('../../dist/core/src/services/faces/peopleResolution.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('confirmed-person', 'Confirmed')").run();
        lifecycle.markPersonConfirmed(db, 'confirmed-person');
        clusters.replaceIdentityClusters(db, {
            algorithmKey: 'prior-run',
            algorithmVersion: '1',
            threshold: 0.6,
            clusters: [{ id: 'old-machine-cluster', centroid: [1, 0], members: [] }],
        });

        await resolution.resolvePeopleAssignments({ dbManager });

        assert.deepEqual(
            db.prepare("SELECT id, name, lifecycle_status FROM people WHERE id = 'confirmed-person'").get(),
            { id: 'confirmed-person', name: 'Confirmed', lifecycle_status: 'confirmed' },
        );
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM identity_clusters').get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12g candidate rebuild restores durable rejection instead of resurrecting acceptance', async () => {
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
        const anchor = seedStableFace(db, stableFaces, 'anchor', 0.1);
        const rejectedFace = seedStableFace(db, stableFaces, 'rejected', 0.3);
        seedActiveVector(db, generations, vectors, anchor.faceId, 'anchor', [1, 0]);
        seedActiveVector(db, generations, vectors, rejectedFace.faceId, 'rejected', [1, 0]);
        recordDecision(db, semantic, predicates, anchor.faceId, 'person-a', 'accepted');
        recordDecision(db, semantic, predicates, rejectedFace.faceId, 'person-a', 'rejected');

        candidates.rebuildFacePersonCandidates(dbManager);
        db.prepare(`
            UPDATE face_person_candidates
            SET decision_status = 'accepted', review_eligible = 1, auto_action_eligible = 1
            WHERE face_id = ? AND person_id = 'person-a'
        `).run(rejectedFace.faceId);

        candidates.rebuildFacePersonCandidates(dbManager);

        assert.deepEqual(
            db.prepare(`
                SELECT decision_status, review_eligible, auto_action_eligible
                FROM face_person_candidates
                WHERE face_id = ? AND person_id = 'person-a'
            `).get(rejectedFace.faceId),
            { decision_status: 'rejected', review_eligible: 0, auto_action_eligible: 0 },
        );
        const currentDecision = db.prepare(`
            SELECT decision.status
            FROM semantic_decisions decision
            JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
            JOIN semantic_entities person ON person.id = proposition.object_entity_id
            WHERE decision.is_current = 1
              AND proposition.subject_entity_id = ?
              AND proposition.predicate = 'depicts'
              AND person.kind = 'person'
              AND person.native_id = 'person-a'
        `).get(rejectedFace.faceId);
        assert.deepEqual(currentDecision, { status: 'rejected' });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
