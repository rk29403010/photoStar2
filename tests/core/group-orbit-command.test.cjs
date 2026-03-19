const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { v4: uuidv4 } = require('uuid');
const {
    createTempDir,
    seedAsset,
    seedSimilarityGroup,
} = require('./workflow-runtime-grouping.helpers.cjs');

function createCollector() {
    const responses = [];
    return {
        responses,
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
    };
}

function seedOrbitHierarchy(dbManager) {
    const db = dbManager.getDb();
    const burstGroupId = uuidv4();
    const variantGroupId = uuidv4();
    const variantCanonicalAssetId = uuidv4();
    const variantMemberAssetId = uuidv4();
    const passthroughAssetId = uuidv4();

    seedAsset(dbManager, {
        id: variantCanonicalAssetId,
        originalPath: 'C:/photos/variant-a.jpg',
        fileHash: 'variant-a',
        fileSize: 3000,
        width: 1200,
        height: 900,
        exifDate: '2026-01-01T12:00:00.000Z',
    });
    seedAsset(dbManager, {
        id: variantMemberAssetId,
        originalPath: 'C:/photos/variant-b.jpg',
        fileHash: 'variant-b',
        fileSize: 2800,
        width: 1200,
        height: 900,
        exifDate: '2026-01-01T12:00:01.000Z',
    });
    seedAsset(dbManager, {
        id: passthroughAssetId,
        originalPath: 'C:/photos/burst-c.jpg',
        fileHash: 'burst-c',
        fileSize: 2600,
        width: 1200,
        height: 900,
        exifDate: '2026-01-01T12:00:02.000Z',
    });

    seedSimilarityGroup(dbManager, {
        groupId: variantGroupId,
        type: 'variant_set',
        status: 'confirmed',
        canonicalAssetId: variantCanonicalAssetId,
        assetIds: [variantCanonicalAssetId, variantMemberAssetId],
        paramsJson: { threshold: 10 },
    });
    seedSimilarityGroup(dbManager, {
        groupId: burstGroupId,
        type: 'burst',
        status: 'confirmed',
        canonicalAssetId: variantCanonicalAssetId,
        assetIds: [passthroughAssetId],
        paramsJson: { maxSeconds: 5 },
    });
    db.prepare(`
        INSERT INTO asset_group_children (parent_group_id, child_group_id, rank)
        VALUES (?, ?, 0)
    `).run(burstGroupId, variantGroupId);

    return {
        burstGroupId,
        variantGroupId,
        variantCanonicalAssetId,
        passthroughAssetId,
    };
}

test('get_group_orbit returns direct child groups and passthrough assets for hierarchy-aware filmstrips', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { collectionCommandHandlers } = await import('../../dist/core/src/services/handlers/collectionCommands.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createCollector();
    try {
        const {
            burstGroupId,
            variantGroupId,
            variantCanonicalAssetId,
            passthroughAssetId,
        } = seedOrbitHierarchy(dbManager);

        collectionCommandHandlers.get_group_orbit({
            id: 'orbit-1',
            payload: { groupId: burstGroupId },
            originWs: null,
            dbManager,
            respond: collector.respond,
        });

        const [{ status, data }] = collector.responses;
        assert.equal(status, 'ok');
        assert.equal(data.orbit.group_id, burstGroupId);
        assert.equal(data.orbit.group_type, 'burst');
        assert.equal(data.orbit.parent_group_id, null);
        assert.equal(data.orbit.items.length, 2);
        assert.deepEqual(
            data.orbit.items.map((item) => [item.kind, item.group_id, item.asset.id]),
            [
                ['group', variantGroupId, variantCanonicalAssetId],
                ['asset', burstGroupId, passthroughAssetId],
            ],
        );
        assert.equal(data.orbit.items[0].stack_count, 2);
        assert.equal(data.orbit.items[1].stack_count, 3);
        assert.deepEqual(
            data.orbit.items[0].asset.group_memberships.map((membership) => membership.group_id),
            [variantGroupId, burstGroupId],
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
