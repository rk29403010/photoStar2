const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function cluster(id, faceIds) {
    return { id, faceIds };
}

function byFaces(clusters) {
    return new Map(clusters.map((item) => [[...item.faceIds].sort().join(','), item.id]));
}

test('WP12b unchanged and shifted memberships keep a clear prior cluster identity', async () => {
    const { reconcileIdentityClusterIds } = await import('../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const previous = [cluster('old-a', ['a', 'b']), cluster('old-b', ['c', 'd'])];
    const proposed = [cluster('fresh-b', ['c', 'd', 'e']), cluster('fresh-a', ['a', 'b'])];

    const result = byFaces(reconcileIdentityClusterIds(previous, proposed));
    assert.equal(result.get('a,b'), 'old-a');
    assert.equal(result.get('c,d,e'), 'old-b');
});

test('WP12b split gives the old id only to the unique strongest continuation', async () => {
    const { reconcileIdentityClusterIds } = await import('../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const result = byFaces(reconcileIdentityClusterIds(
        [cluster('old', ['a', 'b', 'c'])],
        [cluster('fresh-majority', ['a', 'b']), cluster('fresh-minority', ['c'])],
    ));

    assert.equal(result.get('a,b'), 'old');
    assert.equal(result.get('c'), 'fresh-minority');
});

test('WP12b merge gives the old id only to the unique strongest predecessor', async () => {
    const { reconcileIdentityClusterIds } = await import('../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const result = reconcileIdentityClusterIds(
        [cluster('old-majority', ['a', 'b', 'c']), cluster('old-minority', ['d'])],
        [cluster('fresh-merged', ['a', 'b', 'c', 'd'])],
    );

    assert.equal(result[0].id, 'old-majority');
});

test('WP12b equal split and merge ties fail safe with fresh ids', async () => {
    const { reconcileIdentityClusterIds } = await import('../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const split = reconcileIdentityClusterIds(
        [cluster('old', ['a', 'b'])],
        [cluster('fresh-a', ['a']), cluster('fresh-b', ['b'])],
    );
    assert.deepEqual(split.map((item) => item.id).sort(), ['fresh-a', 'fresh-b']);

    const merge = reconcileIdentityClusterIds(
        [cluster('old-a', ['a']), cluster('old-b', ['b'])],
        [cluster('fresh-merge', ['a', 'b'])],
    );
    assert.equal(merge[0].id, 'fresh-merge');
});

test('WP12b reconciliation is independent of previous/proposed array order', async () => {
    const { reconcileIdentityClusterIds } = await import('../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const previous = [cluster('old-a', ['a', 'b']), cluster('old-b', ['c', 'd', 'e'])];
    const proposed = [cluster('fresh-a', ['a', 'b', 'x']), cluster('fresh-b', ['c', 'd', 'e'])];
    const forward = byFaces(reconcileIdentityClusterIds(previous, proposed));
    const reversed = byFaces(reconcileIdentityClusterIds(previous.toReversed(), proposed.toReversed()));
    assert.deepEqual([...forward.entries()].sort(), [...reversed.entries()].sort());
});

test('WP12b persisted reconciliation replaces machine clusters without rewriting Person truth', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12b-clusters-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/faces/identityClusterRepository.js');
    const { reconcileIdentityClusterIds } = await import('../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-a', 'C:/a.jpg'), ('asset-b', 'C:/b.jpg')").run();
        const faceA = stableFaces.createStableFaceDetection(db, {
            assetId: 'asset-a', sourceAnalysisGenerationId: 'analysis-a',
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            sourceWidth: 100, sourceHeight: 100, sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces', provider: 'test', modelVersion: '1',
        });
        const faceB = stableFaces.createStableFaceDetection(db, {
            assetId: 'asset-b', sourceAnalysisGenerationId: 'analysis-b',
            box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
            sourceWidth: 100, sourceHeight: 100, sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces', provider: 'test', modelVersion: '1',
        });
        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES ('person-confirmed', 'Confirmed', NULL)").run();

        repository.replaceIdentityClusters(db, {
            algorithmKey: 'test', algorithmVersion: '1', threshold: 0.6,
            clusters: [{
                id: 'old-cluster', centroid: [1, 0],
                members: [
                    { faceId: faceA.faceId, confidence: 0.9 },
                    { faceId: faceB.faceId, confidence: 0.8 },
                ],
            }],
        });
        const previous = repository.loadIdentityClusters(db);
        const reconciled = reconcileIdentityClusterIds(previous, [
            cluster('fresh-majority', [faceA.faceId]),
            cluster('fresh-minority', [faceB.faceId]),
        ]);
        assert.deepEqual(reconciled.map((item) => item.id).sort(), ['fresh-majority', 'fresh-minority']);
        assert.deepEqual(
            db.prepare('SELECT id, name FROM people').all(),
            [{ id: 'person-confirmed', name: 'Confirmed' }],
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
