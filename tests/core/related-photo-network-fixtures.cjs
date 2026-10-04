const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const { ensureAssetIdentityForAsset } = require('../../dist/core/src/data/assetIdentityRepository.js');
const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
const { recordUserTruth } = require('../../dist/core/src/services/photoAnalysis/userTruth.js');
const { indexPhotoFeatures } = require('../../dist/core/src/services/relatedPhotos/features.js');

function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'photostar-related-network-'));
    const manager = new DatabaseManager(directory);
    t.after(() => { manager.close(); rmSync(directory, { recursive: true, force: true }); });
    return { manager, db: manager.getDb() };
}

function photo(manager, id, file = `${id}.jpg`) {
    const db = manager.getDb();
    db.prepare('INSERT INTO assets(id, original_path, file_hash, file_size) VALUES (?, ?, ?, ?)')
        .run(id, `C:\\Fixture Archive\\${file}`, `hash-${id}`, 100);
    return ensureAssetIdentityForAsset(db, id);
}

const feature = (kind, key, confidence = 'high') => ({ kind, key, label: key, confidence });
const christmasFeatures = () => [feature('scene', 'Distinct striped wallpaper with oak cabinet'),
    feature('clothing', 'Blue velvet jacket with white collar'), feature('decoration', 'Gold paper star over cabinet')];

function observations(manager, assetId, values = christmasFeatures()) {
    const sourceId = `image:${randomUUID()}`;
    const runId = persistAnalysisRun(manager, { assetId, stage: 'scout', provider: 'test-fixture', modelVersion: null,
        promptVersion: 'fixture-1', sources: [{ id: sourceId, assetId, kind: 'image', refId: assetId, text: 'Independent original-photo observation' }],
        result: { claims: [{ field: 'link_features', subjectId: null, value: values, confidence: 'high', kind: 'observation',
            evidence: [], contradictions: [], sourceIds: [sourceId], supersedesId: null }], regions: [], refinementOpportunities: [] } });
    indexPhotoFeatures(manager, assetId);
    return loadAnalysis(manager, assetId).claims.find(claim => claim.runId === runId);
}

function confirmDate(manager, assetId, year = 1976) {
    return recordUserTruth(manager, { assetId, field: 'date', userId: 'fixture-reviewer',
        value: { start: `${year}-12-25`, end: `${year}-12-25`, label: `Christmas ${year}` }, note: 'Verified written date on original print' }).claim;
}

function dateClaim(manager, assetId) {
    return loadAnalysis(manager, assetId).winners.find(claim => claim.field === 'date' && claim.subjectId === null);
}

function roots(manager, claimId) {
    return manager.getDb().prepare('SELECT DISTINCT root_claim_id FROM analysis_claim_roots WHERE claim_id = ? ORDER BY root_claim_id')
        .all(claimId).map(row => row.root_claim_id);
}

function addSet(manager, ids) {
    for (const id of ids) { photo(manager, id); observations(manager, id); }
}

function face(manager, assetId) {
    const { createStableFaceDetection } = require('../../dist/core/src/services/faces/stableFaceRepository.js');
    return createStableFaceDetection(manager.getDb(), { assetId, sourceAnalysisGenerationId: `detection-${assetId}`,
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, sourceWidth: 100, sourceHeight: 100, sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces', provider: 'fixture', modelVersion: '1' }).faceId;
}

function candidate(manager, faceId, anchorFaceId, personId) {
    const db = manager.getDb();
    const { startAnalysisGeneration, markAnalysisGenerationSuccessful } = require('../../dist/core/src/services/machineAnalysis/analysisGenerationRepository.js');
    const suffix = randomUUID();
    db.prepare("INSERT INTO workflow_runs(id,workflow_id,trigger_type,status,input_subjects_json) VALUES (?, 'fixture', 'manual', 'running', '[]')").run(suffix);
    db.prepare("INSERT INTO step_runs(id,workflow_run_id,node_id,status) VALUES (?, ?, 'fixture', 'running')").run(suffix, suffix);
    db.prepare("INSERT INTO subject_executions(id,workflow_run_id,step_run_id,subject_type,subject_id,status) VALUES (?, ?, ?, 'face', ?, 'running')")
        .run(suffix, suffix, suffix, faceId);
    const generation = startAnalysisGeneration(db, { scopeKey: `fixture:${suffix}`, workflowRunId: suffix, stepRunId: suffix,
        subjectExecutionId: suffix, inputFingerprint: suffix, provider: 'fixture', modelKey: 'fixture-vector', modelVersion: '1',
        preprocessingVersion: 'fixture-1', configHash: 'fixture', idempotencyKey: suffix });
    markAnalysisGenerationSuccessful(db, generation.id);
    db.prepare(`INSERT INTO face_person_candidates(face_id,person_id,source_analysis_generation_id,anchor_face_id,
        anchor_analysis_generation_id,raw_cosine,rank,model_key,model_version,preprocessing_version,config_hash,review_eligible,auto_action_eligible)
        VALUES (?, ?, ?, ?, ?, 0.82, 1, 'fixture-vector', '1', 'fixture-1', 'fixture', 1, 0)`)
        .run(faceId, personId, generation.id, anchorFaceId, generation.id);
}

module.exports = { fixture, photo, feature, christmasFeatures, observations, confirmDate, dateClaim, roots, addSet, loadAnalysis, recordUserTruth, face, candidate };
