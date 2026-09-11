const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp10f-face-reset-'));
}

const SOURCE = { provider: 'onnx_retina_10g', modelVersion: '1.0' };
const POLICY = {
    id: 'test.face_reconciliation',
    version: '1',
    compatiblePriorSources: [SOURCE],
    minimumIoU: 0.2,
    landmarkWeight: 0.25,
    ambiguityMargin: 0.02,
};

function geometryInput(sourceAnalysisGenerationId) {
    return {
        sourceAnalysisGenerationId,
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        sourceWidth: 1000,
        sourceHeight: 800,
        sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces',
        ...SOURCE,
    };
}

function seedAsset(db, id, originalPath) {
    db.prepare('INSERT INTO assets (id, original_path) VALUES (?, ?)').run(id, originalPath);
}

function saveFaceMask(db, assetId, visualRegionId) {
    db.prepare(`
        INSERT INTO asset_mask_metadata (asset_id, source_id, schema_version, data)
        VALUES (?, 'runtime.detect_faces', 1, ?)
    `).run(assetId, JSON.stringify({
        schemaVersion: 1,
        masks: [{
            id: 'face-0',
            label: 'Face 1',
            description: 'Locally detected face',
            kind: 'ellipse',
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            visualRegionId,
            source: { moduleId: 'runtime.detect_faces', referenceId: 'face-0' },
        }],
    }));
}

async function seedDurableManualFace(db, assetId, originalPath) {
    const stable = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const manual = await import('../../dist/core/src/services/faces/manualFaceSemanticRepository.js');
    seedAsset(db, assetId, originalPath);
    const identity = stable.createStableFaceDetection(db, {
        assetId,
        ...geometryInput('analysis:seed'),
    });
    saveFaceMask(db, assetId, identity.visualRegionId);
    db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('person-1', 'Jean', NULL)").run();
    db.prepare(`
        INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, is_suggested)
        VALUES (?, 0, 'person-1', 0.9, 0)
    `).run(assetId);
    manual.recordManualFacePersonDecision(db, {
        assetId,
        faceIndex: 0,
        personId: 'person-1',
        personName: 'Jean',
        status: 'accepted',
        sourceRef: 'test.manual',
    });
    return identity;
}

test('WP10f soft reset keeps stable manually-touched Face identity and reconciles it after reimport', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const reconciliation = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        let db = dbManager.getDb();
        const originalPath = 'C:/photos/reset-face.jpg';
        const identity = await seedDurableManualFace(db, 'asset-before', originalPath);

        dbManager.resetPreservingManualData();
        db = dbManager.getDb();

        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM assets').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM faces WHERE id = ?').get(identity.faceId).count, 1);
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM visual_regions WHERE id = ?').get(identity.visualRegionId).count,
            1,
        );
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM visual_region_geometry_generations WHERE visual_region_id = ?')
                .get(identity.visualRegionId).count,
            1,
        );
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM semantic_decisions decision
            JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
            WHERE proposition.subject_entity_id = ? AND decision.status = 'accepted'
        `).get(identity.faceId).count, 1);

        seedAsset(db, 'asset-after', originalPath);
        const [reconciled] = reconciliation.reconcileAndPersistStableFaceDetections(db, {
            assetId: 'asset-after',
            sourceAnalysisGenerationId: 'analysis:after-reset',
            detections: [{ detectionId: 'rerun-face', box: geometryInput('unused').box }],
            sourceWidth: 1000,
            sourceHeight: 800,
            sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces',
            ...SOURCE,
            policy: POLICY,
        });
        assert.equal(reconciled.faceId, identity.faceId);
        assert.equal(reconciled.visualRegionId, identity.visualRegionId);
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM visual_region_geometry_generations WHERE visual_region_id = ?')
                .get(identity.visualRegionId).count,
            2,
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP10f face-analysis reset keeps stable identity, durable Person and human decision while clearing rebuildable face state', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const reconciliation = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const identity = await seedDurableManualFace(db, 'asset-1', 'C:/photos/face-reset.jpg');
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('detection-1', 'asset-1', 'face_detection', 'onnx_retina_10g', '1.0', '{"faces":[]}')
        `).run();

        let response;
        handleSystemCommand({
            id: 'reset-faces',
            command: 'reset_faces',
            payload: {},
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: (_id, status, data, error) => {
                response = { status, data, error };
            },
        });
        assert.equal(response.status, 'ok');
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'face_detection'").get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM asset_mask_metadata').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM face_assignments').get().count, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM people WHERE id = 'person-1'").get().count, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM faces WHERE id = ?').get(identity.faceId).count, 1);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM semantic_decisions decision
            JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
            WHERE proposition.subject_entity_id = ? AND decision.status = 'accepted'
        `).get(identity.faceId).count, 1);

        const [reconciled] = reconciliation.reconcileAndPersistStableFaceDetections(db, {
            assetId: 'asset-1',
            sourceAnalysisGenerationId: 'analysis:after-face-reset',
            detections: [{ detectionId: 'rerun-face', box: geometryInput('unused').box }],
            sourceWidth: 1000,
            sourceHeight: 800,
            sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces',
            ...SOURCE,
            policy: POLICY,
        });
        assert.equal(reconciled.faceId, identity.faceId);
        assert.equal(reconciled.visualRegionId, identity.visualRegionId);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP10f remove and reimport at the same durable asset identity reuses the stable Face when geometry is compatible', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const reconciliation = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const originalPath = 'C:/photos/reimport.jpg';
        const identity = await seedDurableManualFace(db, 'asset-old', originalPath);

        db.prepare("DELETE FROM face_assignments WHERE asset_id = 'asset-old'").run();
        db.prepare("DELETE FROM asset_mask_metadata WHERE asset_id = 'asset-old'").run();
        db.prepare("DELETE FROM assets WHERE id = 'asset-old'").run();
        seedAsset(db, 'asset-new', originalPath);

        const [reconciled] = reconciliation.reconcileAndPersistStableFaceDetections(db, {
            assetId: 'asset-new',
            sourceAnalysisGenerationId: 'analysis:reimport',
            detections: [{ detectionId: 'reimported-face', box: { x: 0.11, y: 0.1, width: 0.2, height: 0.2 } }],
            sourceWidth: 1000,
            sourceHeight: 800,
            sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces',
            ...SOURCE,
            policy: POLICY,
        });
        assert.equal(reconciled.faceId, identity.faceId);
        assert.equal(reconciled.visualRegionId, identity.visualRegionId);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
