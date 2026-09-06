const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-library-presentation-'));
}

function seedAssets(db) {
    const insert = db.prepare(`
        INSERT INTO assets (
            id, original_path, file_hash, file_size, width, height,
            photo_created_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const assets = [
        ['jpeg-copy', 'C:/photos/copy.jpg', 'same-content', 1200, 1200, 800, '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'],
        ['png-copy', 'C:/photos/copy.png', 'same-content', 2200, 1200, 800, '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'],
        ['small-copy', 'C:/photos/small.jpg', 'same-content', 600, 600, 400, '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'],
        ['unique-new', 'C:/photos/unique-new.jpg', 'unique-new-content', 900, 900, 600, '2025-02-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z'],
        ['unique-old', 'C:/photos/unique-old.jpg', null, 800, 800, 600, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
    ];
    for (const asset of assets) {
        insert.run(...asset);
    }
    return assets.map((asset) => asset[0]);
}

async function loadLegacyGroupedPage({ dbManager, tempDir, limit, offset }) {
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let response;
    await handleSystemCommand({
        id: `legacy-${offset}`,
        command: 'get_assets',
        payload: { limit, offset, withGroupCounts: true, galleryOrder: 'default' },
        dbManager,
        eventBus: {},
        activeJobs: new Map(),
        LIB_DIR: tempDir,
        respond: (id, status, data, error) => { response = { id, status, data, error }; },
    });
    assert.equal(response.status, 'ok');
    return response.data.assets;
}

test('exact-copy presentation collapses before pagination and matches legacy duplicate paging', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryPresentationProjection.js');
    const { rebuildImpactedDuplicateGroups } = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupingPersistence.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const assetIds = seedAssets(db);
        rebuildImpactedDuplicateGroups({ db, changedAssetIds: assetIds });

        const firstPage = presentation.getExactCopyPresentationPage(db, { limit: 2, offset: 0 });
        const secondPage = presentation.getExactCopyPresentationPage(db, { limit: 2, offset: 2 });
        assert.equal(presentation.countExactCopyPresentationItems(db), 3);
        assert.deepEqual(firstPage.map((item) => item.representativeAssetId), ['png-copy', 'unique-new']);
        assert.deepEqual(secondPage.map((item) => item.representativeAssetId), ['unique-old']);
        assert.deepEqual(firstPage[0], {
            presentationKey: 'exact:same-content',
            representativeAssetId: 'png-copy',
            relationshipKind: 'exact_copy',
            stackCount: 3,
            assetIds: ['jpeg-copy', 'png-copy', 'small-copy'],
            originalPath: 'C:/photos/copy.png',
            photoCreatedAt: '2025-03-01T00:00:00.000Z',
            createdAt: '2025-03-01T00:00:00.000Z',
            previewPath: null,
        });

        const legacyFirstPage = await loadLegacyGroupedPage({ dbManager, tempDir, limit: 2, offset: 0 });
        const legacySecondPage = await loadLegacyGroupedPage({ dbManager, tempDir, limit: 2, offset: 2 });
        assert.deepEqual(
            firstPage.map((item) => item.representativeAssetId),
            legacyFirstPage.map((asset) => asset.id),
        );
        assert.deepEqual(
            secondPage.map((item) => item.representativeAssetId),
            legacySecondPage.map((asset) => asset.id),
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('exact-copy presentation mirrors legacy behaviour when a stack representative is binned', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryPresentationProjection.js');
    const { rebuildImpactedDuplicateGroups } = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupingPersistence.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const assetIds = seedAssets(db);
        rebuildImpactedDuplicateGroups({ db, changedAssetIds: assetIds });
        db.prepare("UPDATE assets SET binned_at = '2026-09-06T00:00:00.000Z' WHERE id = 'png-copy'").run();

        const shadowIds = presentation.getExactCopyPresentationPage(db, { limit: 20, offset: 0 })
            .map((item) => item.representativeAssetId);
        const legacyIds = (await loadLegacyGroupedPage({ dbManager, tempDir, limit: 20, offset: 0 }))
            .map((asset) => asset.id);
        assert.deepEqual(shadowIds, legacyIds);
        assert.equal(shadowIds.includes('jpeg-copy'), false);
        assert.equal(shadowIds.includes('small-copy'), false);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
