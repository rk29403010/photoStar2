const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp10g-people-actions-'));
}

test('WP10g stable face actions resolve and persist by faceId without positional command identity', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const manual = await import('../../dist/core/src/services/faces/manualFaceSemanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-1', 'C:/photos/stable-action.jpg')").run();
        const identity = stableFaces.createStableFaceDetection(db, {
            assetId: 'asset-1',
            sourceAnalysisGenerationId: 'analysis:1',
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
            VALUES ('asset-1', 'runtime.detect_faces', 1, ?)
        `).run(JSON.stringify({
            schemaVersion: 1,
            masks: [{
                id: 'face-0',
                label: 'Face 1',
                kind: 'ellipse',
                box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
                visualRegionId: identity.visualRegionId,
                source: { moduleId: 'runtime.detect_faces', referenceId: 'face-0' },
            }],
        }));

        const position = manual.resolveStableFaceById(db, identity.faceId);
        assert.deepEqual(position, {
            faceId: identity.faceId,
            visualRegionId: identity.visualRegionId,
            assetId: 'asset-1',
            faceIndex: 0,
        });

        const recorded = manual.recordManualFacePersonDecisionByFaceId(db, {
            faceId: identity.faceId,
            personId: 'person-1',
            personName: 'Jean',
            status: 'accepted',
            sourceRef: 'test.wp10g',
        });
        assert.equal(recorded.faceId, identity.faceId);

        const decision = db.prepare(`
            SELECT proposition.subject_entity_id AS face_id,
                   person.native_id AS person_id,
                   decision.status
            FROM semantic_decisions decision
            JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
            JOIN semantic_entities person ON person.id = proposition.object_entity_id
            WHERE decision.is_current = 1
        `).get();
        assert.deepEqual(decision, {
            face_id: identity.faceId,
            person_id: 'person-1',
            status: 'accepted',
        });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
