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


test('WP10c persistence orchestrator reuses stable IDs across reordered reruns and tombstones removals', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const reconciliation = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-2', 'C:/photos/rerun.jpg')").run();

        const baseInput = {
            assetId: 'asset-2',
            sourceWidth: 1000,
            sourceHeight: 800,
            sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces',
            provider: 'onnx_retina_10g',
            modelVersion: '1.0',
            policy: {
                id: 'test.face_reconciliation',
                version: '1',
                compatiblePriorSources: [{ provider: 'onnx_retina_10g', modelVersion: '1.0' }],
                minimumIoU: 0.2,
                landmarkWeight: 0.25,
                ambiguityMargin: 0.02,
            },
        };
        const left = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
        const right = { x: 0.65, y: 0.15, width: 0.2, height: 0.2 };

        const first = reconciliation.reconcileAndPersistStableFaceDetections(db, {
            ...baseInput,
            sourceAnalysisGenerationId: 'analysis:first',
            detections: [
                { detectionId: 'first-left', box: left },
                { detectionId: 'first-right', box: right },
            ],
        });

        const second = reconciliation.reconcileAndPersistStableFaceDetections(db, {
            ...baseInput,
            sourceAnalysisGenerationId: 'analysis:second',
            detections: [
                { detectionId: 'second-right', box: { ...right, x: 0.64 } },
                { detectionId: 'second-left', box: { ...left, x: 0.11 } },
            ],
        });

        assert.equal(second[0].visualRegionId, first[1].visualRegionId);
        assert.equal(second[1].visualRegionId, first[0].visualRegionId);
        assert.equal(second[0].faceId, first[1].faceId);
        assert.equal(second[1].faceId, first[0].faceId);

        reconciliation.reconcileAndPersistStableFaceDetections(db, {
            ...baseInput,
            sourceAnalysisGenerationId: 'analysis:third',
            detections: [{ detectionId: 'third-left', box: { ...left, x: 0.12 } }],
        });

        const rightStatuses = db.prepare(`
            SELECT status
            FROM visual_region_geometry_generations
            WHERE visual_region_id = ?
            ORDER BY rowid ASC
        `).all(first[1].visualRegionId);
        assert.deepEqual(rightStatuses, [
            { status: 'active' },
            { status: 'active' },
            { status: 'tombstoned' },
        ]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
