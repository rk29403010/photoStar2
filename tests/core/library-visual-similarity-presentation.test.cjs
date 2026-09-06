const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
    createTempDir,
    runGroupingWorkflow,
    seedAsset,
    seedAssetFeatures,
} = require('./workflow-runtime-grouping.helpers.cjs');

function seedReadyAsset(dbManager, params) {
    seedAsset(dbManager, {
        id: params.id,
        originalPath: `C:/photos/${params.id}.jpg`,
        fileHash: `${params.id}-hash`,
        fileSize: params.fileSize ?? 1000,
        width: params.width ?? 1200,
        height: params.height ?? 800,
        exifDate: params.exifDate ?? null,
    });
    seedAssetFeatures(dbManager, {
        assetId: params.id,
        fileHash: `${params.id}-hash`,
        phash64: params.phash64,
        dhash64: params.dhash64,
    });
}

async function loadLegacyGroupedAssets(dbManager, tempDir) {
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let response;
    await handleSystemCommand({
        id: 'legacy-visual-presentation',
        command: 'get_assets',
        payload: { limit: 20, offset: 0, withGroupCounts: true, galleryOrder: 'default' },
        dbManager,
        eventBus: {},
        activeJobs: new Map(),
        LIB_DIR: tempDir,
        respond: (id, status, data, error) => {
            response = { id, status, data, error };
        },
    });
    assert.equal(response.status, 'ok');
    return response.data.assets;
}

test('near-duplicate presentation reproduces the legacy visible representative from observations', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryVisualSimilarityPresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, {
            id: 'asset-a',
            fileSize: 1000,
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-b',
            fileSize: 2000,
            phash64: '0000000000000001',
            dhash64: '0000000000000003',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: 'asset-a' },
                { subjectType: 'asset', subjectId: 'asset-b' },
            ],
        });

        const db = dbManager.getDb();
        const shadow = presentation.getVisualSimilarityPresentationPage(db, { limit: 20, offset: 0 });
        const legacy = await loadLegacyGroupedAssets(dbManager, tempDir);

        assert.deepEqual(
            shadow.map((item) => item.representativeAssetId),
            legacy.map((asset) => asset.id),
        );
        assert.equal(shadow.length, 1);
        assert.equal(shadow[0].relationshipKind, 'near_duplicate');
        assert.equal(shadow[0].representativeAssetId, 'asset-b');
        assert.equal(shadow[0].stackCount, 2);
        assert.deepEqual(shadow[0].assetIds, ['asset-a', 'asset-b']);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('variant presentation consumes a near-duplicate cluster as one unit and matches legacy grouping', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryVisualSimilarityPresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, {
            id: 'asset-a',
            fileSize: 1000,
            exifDate: '2025-01-01T10:00:00.000Z',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-b',
            fileSize: 2000,
            exifDate: '2025-01-01T10:00:01.000Z',
            phash64: '0000000000000001',
            dhash64: '0000000000000003',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-c',
            fileSize: 1500,
            exifDate: '2025-01-01T10:00:05.000Z',
            phash64: '000000000000000f',
            dhash64: '000000000000000f',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: 'asset-a' },
                { subjectType: 'asset', subjectId: 'asset-b' },
                { subjectType: 'asset', subjectId: 'asset-c' },
            ],
        });

        const db = dbManager.getDb();
        const shadow = presentation.getVisualSimilarityPresentationPage(db, { limit: 20, offset: 0 });
        const legacy = await loadLegacyGroupedAssets(dbManager, tempDir);

        assert.deepEqual(
            shadow.map((item) => item.representativeAssetId),
            legacy.map((asset) => asset.id),
        );
        assert.equal(shadow.length, 1);
        assert.equal(shadow[0].relationshipKind, 'variant');
        assert.equal(shadow[0].representativeAssetId, 'asset-c');
        assert.equal(shadow[0].stackCount, 3);
        assert.deepEqual(shadow[0].assetIds, ['asset-a', 'asset-b', 'asset-c']);

        const legacyHierarchy = db.prepare(`
            SELECT parent.type AS parent_type, child.type AS child_type
            FROM asset_group_children link
            JOIN asset_groups parent ON parent.id = link.parent_group_id
            JOIN asset_groups child ON child.id = link.child_group_id
            WHERE parent.type = 'variant_set'
        `).all();
        assert.deepEqual(legacyHierarchy, [{ parent_type: 'variant_set', child_type: 'near_duplicate' }]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
