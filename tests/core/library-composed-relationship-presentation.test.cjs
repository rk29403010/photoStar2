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

async function loadCollapsedGallery(dbManager, tempDir, payload = {}) {
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let response;
    await handleSystemCommand({
        id: 'composed-presentation',
        command: 'get_assets',
        payload: { limit: 20, offset: 0, withGroupCounts: true, galleryOrder: 'default', ...payload },
        dbManager,
        eventBus: {},
        activeJobs: new Map(),
        LIB_DIR: tempDir,
        respond: (id, status, data, error) => {
            response = { id, status, data, error };
        },
    });
    assert.equal(response.status, 'ok');
    return response.data;
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
        const commandResult = await loadCollapsedGallery(dbManager, tempDir);

        assert.deepEqual(
            shadow.map((item) => item.representativeAssetId),
            commandResult.assets.map((asset) => asset.id),
        );
        assert.equal(shadow.length, 1);
        assert.equal(shadow[0].relationshipKind, 'capture_sequence');
        assert.equal(shadow[0].representativeAssetId, 'asset-d');
        assert.equal(shadow[0].momentCount, 2);
        assert.equal(shadow[0].stackCount, 3);
        assert.deepEqual(shadow[0].assetIds, ['asset-a', 'asset-b', 'asset-d']);

        assert.deepEqual(commandResult.assets.map((asset) => asset.id), ['asset-d']);
        assert.equal('group_id' in commandResult.assets[0], false);
        assert.deepEqual(commandResult.presentationItems, [{
            presentationKey: commandResult.presentationItems[0].presentationKey,
            representativeAssetId: 'asset-d',
            relationshipKind: 'capture_sequence',
            stackCount: 3,
            assetIds: ['asset-a', 'asset-b', 'asset-d'],
            momentCount: 2,
        }]);
        assert.match(commandResult.presentationItems[0].presentationKey, /^sequence:/);
        assert.equal(commandResult.total, 1);
        assert.equal(commandResult.hasMore, false);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('collapsed tag filtering keeps a stack when only a non-representative member matches', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedAsset(dbManager, {
            id: 'copy-small',
            originalPath: 'C:/photos/copy-small.jpg',
            fileHash: 'same-content',
            fileSize: 1000,
            width: 1200,
            height: 800,
        });
        seedAsset(dbManager, {
            id: 'copy-best',
            originalPath: 'C:/photos/copy-best.jpg',
            fileHash: 'same-content',
            fileSize: 2000,
            width: 1200,
            height: 800,
        });
        seedAsset(dbManager, {
            id: 'unrelated',
            originalPath: 'C:/photos/unrelated.jpg',
            fileHash: 'other-content',
            fileSize: 3000,
            width: 1200,
            height: 800,
        });

        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO tag_definitions (id, canonical_label, status)
            VALUES ('tag-member-only', 'member-only', 'active')
        `).run();
        db.prepare(`
            INSERT INTO asset_tag_assignments (asset_id, tag_definition_id, source_kind)
            VALUES ('copy-small', 'tag-member-only', 'manual_user')
        `).run();

        const filtered = await loadCollapsedGallery(dbManager, tempDir, {
            filter: { type: 'tag', value: 'member-only' },
        });

        assert.deepEqual(filtered.assets.map((asset) => asset.id), ['copy-best']);
        assert.equal(filtered.presentationItems.length, 1);
        assert.equal(filtered.presentationItems[0].relationshipKind, 'exact_copy');
        assert.equal(filtered.presentationItems[0].representativeAssetId, 'copy-best');
        assert.deepEqual(filtered.presentationItems[0].assetIds, ['copy-best', 'copy-small']);
        assert.equal(filtered.presentationItems[0].stackCount, 2);
        assert.equal(filtered.total, 1);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
