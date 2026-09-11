const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp10c-face-state-'));
}

function geometryInput(overrides = {}) {
    return {
        sourceAnalysisGenerationId: 'analysis:old',
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        sourceWidth: 1000,
        sourceHeight: 800,
        sourceOrientation: 1,
        sourceModuleId: 'runtime.detect_faces',
        provider: 'onnx_retina_10g',
        modelVersion: '1.0',
        ...overrides,
    };
}

test('WP10c persistence reuses matched identity and retains append-only lifecycle history', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-1', 'C:/photos/face.jpg')").run();

        const first = repository.createStableFaceDetection(db, {
            assetId: 'asset-1',
            ...geometryInput(),
        });
        const second = repository.createStableFaceDetection(db, {
            assetId: 'asset-1',
            ...geometryInput({ box: { x: 0.6, y: 0.1, width: 0.2, height: 0.2 } }),
        });

        assert.equal(repository.loadReconcileableStableFaceRegions(db, 'asset-1').length, 2);

        const reused = repository.reuseStableFaceDetection(db, {
            visualRegionId: first.visualRegionId,
            ...geometryInput({
                sourceAnalysisGenerationId: 'analysis:new',
                box: { x: 0.11, y: 0.1, width: 0.2, height: 0.2 },
            }),
        });
        assert.equal(reused.visualRegionId, first.visualRegionId);
        assert.equal(reused.faceId, first.faceId);

        repository.markStableFaceRegionStatus(db, {
            visualRegionId: second.visualRegionId,
            ...geometryInput({ sourceAnalysisGenerationId: 'analysis:new' }),
            status: 'tombstoned',
        });

        let current = repository.loadReconcileableStableFaceRegions(db, 'asset-1');
        assert.deepEqual(current.map((region) => region.visualRegionId), [first.visualRegionId]);
        assert.equal(current[0].status, 'active');
        assert.deepEqual(current[0].box, { x: 0.11, y: 0.1, width: 0.2, height: 0.2 });

        repository.markStableFaceRegionStatus(db, {
            visualRegionId: first.visualRegionId,
            ...geometryInput({ sourceAnalysisGenerationId: 'analysis:ambiguous' }),
            status: 'unmatched',
        });
        current = repository.loadReconcileableStableFaceRegions(db, 'asset-1');
        assert.equal(current.length, 1);
        assert.equal(current[0].visualRegionId, first.visualRegionId);
        assert.equal(current[0].status, 'unmatched');

        const firstHistory = db.prepare(`
            SELECT status, x
            FROM visual_region_geometry_generations
            WHERE visual_region_id = ?
            ORDER BY rowid ASC
        `).all(first.visualRegionId);
        assert.deepEqual(firstHistory, [
            { status: 'active', x: 0.1 },
            { status: 'active', x: 0.11 },
            { status: 'unmatched', x: 0.11 },
        ]);

        const secondHistory = db.prepare(`
            SELECT status
            FROM visual_region_geometry_generations
            WHERE visual_region_id = ?
            ORDER BY rowid ASC
        `).all(second.visualRegionId);
        assert.deepEqual(secondHistory, [{ status: 'active' }, { status: 'tombstoned' }]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
