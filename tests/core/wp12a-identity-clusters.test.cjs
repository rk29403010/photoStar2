const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12a-clusters-'));
}

function geometryInput(sourceAnalysisGenerationId) {
    return {
        sourceAnalysisGenerationId,
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        sourceWidth: 1000,
        sourceHeight: 800,
        sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces',
        provider: 'onnx_retina_10g',
        modelVersion: '1.0',
    };
}

test('WP12a IdentityClusters rebuild independently from durable People', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const clusters = await import('../../dist/core/src/services/faces/identityClusterRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const migration = db.prepare("SELECT id FROM schema_migrations WHERE id = '20260912_001_identity_clusters'").get();
        assert.equal(migration.id, '20260912_001_identity_clusters');

        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-1', 'C:/photos/a.jpg')").run();
        const face = stableFaces.createStableFaceDetection(db, {
            assetId: 'asset-1',
            ...geometryInput('analysis:face-1'),
        });
        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('person-confirmed', 'Robin', NULL)").run();

        clusters.replaceIdentityClusters(db, {
            algorithmKey: 'test.clusterer',
            algorithmVersion: '1',
            threshold: 0.6,
            clusters: [{
                id: 'cluster-old',
                centroid: [1, 0],
                members: [{ faceId: face.faceId, confidence: 0.95 }],
            }],
        });
        assert.deepEqual(
            db.prepare('SELECT id FROM identity_clusters ORDER BY id').all(),
            [{ id: 'cluster-old' }],
        );
        assert.deepEqual(
            db.prepare('SELECT cluster_id, face_id FROM identity_cluster_members').all(),
            [{ cluster_id: 'cluster-old', face_id: face.faceId }],
        );

        clusters.replaceIdentityClusters(db, {
            algorithmKey: 'test.clusterer',
            algorithmVersion: '1',
            threshold: 0.7,
            clusters: [{
                id: 'cluster-new',
                centroid: [0.9, 0.1],
                members: [{ faceId: face.faceId, confidence: 0.91 }],
            }],
        });

        assert.deepEqual(
            db.prepare('SELECT id, threshold FROM identity_clusters ORDER BY id').all(),
            [{ id: 'cluster-new', threshold: 0.7 }],
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM identity_clusters WHERE id = 'cluster-old'").get().count, 0);
        assert.deepEqual(
            db.prepare('SELECT id, name FROM people ORDER BY id').all(),
            [{ id: 'person-confirmed', name: 'Robin' }],
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12a empty machine rebuild clears clusters and assignments without deleting People', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { resolvePeopleAssignments } = await import('../../dist/core/src/services/faces/peopleResolution.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('person-curated', 'Curated person', NULL)").run();
        await resolvePeopleAssignments({ dbManager });
        assert.deepEqual(
            db.prepare('SELECT id, name FROM people ORDER BY id').all(),
            [{ id: 'person-curated', name: 'Curated person' }],
        );
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM identity_clusters').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM face_assignments').get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
