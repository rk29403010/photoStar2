const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp10e-manual-face-'));
}

async function seedStableFace(db, repository, assetId, originalPath, faceIndex = 0) {
    db.prepare('INSERT INTO assets (id, original_path) VALUES (?, ?)').run(assetId, originalPath);
    const identity = repository.createStableFaceDetection(db, {
        assetId,
        sourceAnalysisGenerationId: `analysis:${assetId}`,
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        sourceWidth: 1000,
        sourceHeight: 800,
        sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces',
        provider: 'onnx_retina_10g',
        modelVersion: '1.0',
    });
    db.prepare(`
        INSERT INTO asset_mask_metadata (asset_id, source_id, schema_version, data)
        VALUES (?, 'runtime.detect_faces', 1, ?)
    `).run(assetId, JSON.stringify({
        schemaVersion: 1,
        masks: [{
            id: `face-${faceIndex}`,
            label: `Face ${faceIndex + 1}`,
            description: 'Locally detected face',
            kind: 'ellipse',
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            visualRegionId: identity.visualRegionId,
            source: { moduleId: 'runtime.detect_faces', referenceId: `face-${faceIndex}` },
        }],
    }));
    return identity;
}

test('WP10e manual face decisions persist stable Face-to-Person truth without legacy durable face-index writes', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const manual = await import('../../dist/core/src/services/faces/manualFaceSemanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const identity = await seedStableFace(db, stableFaces, 'asset-1', 'C:/photos/one.jpg');
        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('person-1', 'Jean', NULL)").run();
        db.prepare(`
            INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, is_suggested)
            VALUES ('asset-1', 0, 'person-1', 0.9, 1)
        `).run();

        const recorded = manual.recordManualFacePersonDecisionByFaceId(db, {
            faceId: identity.faceId,
            personId: 'person-1',
            personName: 'Jean',
            status: 'accepted',
            sourceRef: 'test.confirm',
        });

        assert.equal(recorded.faceId, identity.faceId);
        assert.equal(recorded.personEntityId, 'person:person-1');
        const current = db.prepare(`
            SELECT d.status, p.subject_entity_id, p.predicate, p.object_entity_id
            FROM semantic_decisions d
            JOIN semantic_propositions p ON p.id = d.proposition_id
            WHERE d.is_current = 1
        `).get();
        assert.deepEqual(current, {
            status: 'accepted',
            subject_entity_id: identity.faceId,
            predicate: 'depicts',
            object_entity_id: 'person:person-1',
        });
        const legacyTables = db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name IN ('manual_face_names', 'manual_face_isolations')
        `).all();
        assert.deepEqual(legacyTables, []);

        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('machine-person', 'Machine', NULL)").run();
        db.prepare(`
            UPDATE face_assignments
            SET person_id = 'machine-person', is_suggested = 1
            WHERE asset_id = 'asset-1' AND face_index = 0
        `).run();
        manual.applyStableManualFaceDecisionProjection(db);
        assert.deepEqual(db.prepare(`
            SELECT person_id, is_suggested
            FROM face_assignments
            WHERE asset_id = 'asset-1' AND face_index = 0
        `).get(), { person_id: 'person-1', is_suggested: 0 });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP10e rejected stable decision removes only the matching compatibility assignment', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const manual = await import('../../dist/core/src/services/faces/manualFaceSemanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        await seedStableFace(db, stableFaces, 'asset-2', 'C:/photos/two.jpg');
        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('person-2', 'Mary', NULL)").run();
        db.prepare(`
            INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, is_suggested)
            VALUES ('asset-2', 0, 'person-2', 0.8, 0)
        `).run();

        manual.recordManualFacePersonDecision(db, {
            assetId: 'asset-2',
            faceIndex: 0,
            personId: 'person-2',
            personName: 'Mary',
            status: 'rejected',
            sourceRef: 'test.reject',
        });
        manual.applyStableManualFaceDecisionProjection(db);

        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM face_assignments
            WHERE asset_id = 'asset-2' AND face_index = 0
        `).get().count, 0);
        assert.deepEqual(manual.getRejectedAssetIdsForPerson(db, 'person-2'), ['asset-2']);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
