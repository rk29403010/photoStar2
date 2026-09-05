const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-exact-duplicate-projection-'));
}

function seedAssets(db, assets) {
    const insert = db.prepare(`
        INSERT INTO assets (
            id,
            original_path,
            file_hash,
            file_size,
            width,
            height,
            exif_datetime
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const asset of assets) {
        insert.run(
            asset.id,
            asset.path,
            asset.hash,
            asset.fileSize,
            asset.width,
            asset.height,
            asset.exifDatetime ?? null,
        );
    }
}

test('exact duplicate projection matches legacy duplicate membership and representative selection', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { getExactDuplicateSets } = await import('../../dist/core/src/services/relationships/exactDuplicateProjection.js');
    const { rebuildImpactedDuplicateGroups } = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupingPersistence.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAssets(db, [
            { id: 'jpeg-copy', path: 'C:/photos/copy.jpg', hash: 'same-content', fileSize: 1200, width: 1200, height: 800 },
            { id: 'png-copy', path: 'C:/photos/copy.png', hash: 'same-content', fileSize: 2200, width: 1200, height: 800 },
            { id: 'small-copy', path: 'C:/photos/small.jpg', hash: 'same-content', fileSize: 600, width: 600, height: 400 },
            { id: 'unique', path: 'C:/photos/unique.jpg', hash: 'unique-content', fileSize: 900, width: 900, height: 600 },
        ]);

        rebuildImpactedDuplicateGroups({
            db,
            changedAssetIds: ['jpeg-copy', 'png-copy', 'small-copy', 'unique'],
        });

        const projection = getExactDuplicateSets(db);
        assert.equal(projection.length, 1);
        assert.equal(projection[0].key, 'exact:same-content');
        assert.equal(projection[0].contentHash, 'same-content');
        assert.equal(projection[0].representativeAssetId, 'png-copy');
        assert.deepEqual(projection[0].assetIds, ['jpeg-copy', 'png-copy', 'small-copy']);
        assert.equal(projection[0].count, 3);

        const legacyGroup = db.prepare(`
            SELECT id, canonical_asset_id AS canonicalAssetId
            FROM asset_groups
            WHERE type = 'duplicate'
        `).get();
        const legacyMembers = db.prepare(`
            SELECT asset_id AS assetId
            FROM asset_group_members
            WHERE group_id = ?
            ORDER BY asset_id ASC
        `).all(legacyGroup.id).map((row) => row.assetId);

        assert.equal(projection[0].representativeAssetId, legacyGroup.canonicalAssetId);
        assert.deepEqual(projection[0].assetIds, legacyMembers);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('exact duplicate projection is stable across asset insertion order', async () => {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { getExactDuplicateSets } = await import('../../dist/core/src/services/relationships/exactDuplicateProjection.js');
    const assets = [
        { id: 'a', path: 'C:/photos/a.jpg', hash: 'hash-a', fileSize: 100, width: 100, height: 100 },
        { id: 'b', path: 'C:/photos/b.jpg', hash: 'hash-a', fileSize: 100, width: 100, height: 100 },
        { id: 'c', path: 'C:/photos/c.jpg', hash: 'hash-b', fileSize: 100, width: 100, height: 100 },
        { id: 'd', path: 'C:/photos/d.jpg', hash: 'hash-b', fileSize: 200, width: 200, height: 200 },
    ];

    const projections = [];
    for (const orderedAssets of [assets, assets.toReversed()]) {
        const tempDir = createTempDir();
        const dbManager = new DatabaseManager(tempDir);
        try {
            seedAssets(dbManager.getDb(), orderedAssets);
            projections.push(getExactDuplicateSets(dbManager.getDb()));
        } finally {
            dbManager.close();
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    assert.deepEqual(projections[0], projections[1]);
});
