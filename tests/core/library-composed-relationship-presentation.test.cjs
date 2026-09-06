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
        fileSize: params.fileSize,
        width: 1200,
        height: 800,
        exifDate: params.exifDate,
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
        id: 'legacy-composed-presentation',
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

test('CaptureSequence presentation treats a nested near-duplicate family as one capture moment', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryCaptureSequencePresentationProjection.js');
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
            exifDate: '2025-01-01T10:00:00.200Z',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-d',
            fileSize: 1500,
            exifDate: '2025-01-01T10:00:02.000Z',
            phash64: '00000000000000ff',
            dhash64: '00000000000000ff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: 'asset-a' },
                { subjectType: 'asset', subjectId: 'asset-b' },
                { subjectType: 'asset', subjectId: 'asset-d' },
            ],
        });

        const db = dbManager.getDb();
        const shadow = presentation.getCaptureSequencePresentationPage(db, { limit: 20, offset: 0 });
        const legacy = await loadLegacyGroupedAssets(dbManager, tempDir);

        assert.deepEqual(
            shadow.map((item) => item.representativeAssetId),
            legacy.map((asset) => asset.id),
        );
        assert.equal(shadow.length, 1);
        assert.equal(shadow[0].relationshipKind, 'capture_sequence');
        assert.equal(shadow[0].representativeAssetId, 'asset-d');
        assert.equal(shadow[0].momentCount, 2);
        assert.equal(shadow[0].stackCount, 3);
        assert.deepEqual(shadow[0].assetIds, ['asset-a', 'asset-b', 'asset-d']);

        const hierarchy = db.prepare(`
            SELECT parent.type AS parent_type, child.type AS child_type
            FROM asset_group_children link
            JOIN asset_groups parent ON parent.id = link.parent_group_id
            JOIN asset_groups child ON child.id = link.child_group_id
            WHERE parent.type = 'burst'
        `).all();
        assert.deepEqual(hierarchy, [{ parent_type: 'burst', child_type: 'near_duplicate' }]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
