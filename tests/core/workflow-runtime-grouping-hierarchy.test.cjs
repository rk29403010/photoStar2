const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const {
    createFixtureImage,
    createTempDir,
    hashFileContents,
    runGroupingWorkflow,
    seedAsset,
    seedAssetFeatures,
} = require('./workflow-runtime-grouping.helpers.cjs');

function getGroupId(dbManager, type) {
    const row = dbManager.getDb().prepare(`
        SELECT id
        FROM asset_groups
        WHERE type = ?
    `).get(type);
    return row?.id ?? null;
}

function getChildGroupIds(dbManager, parentGroupId) {
    return dbManager.getDb().prepare(`
        SELECT child_group_id
        FROM asset_group_children
        WHERE parent_group_id = ?
        ORDER BY child_group_id ASC
    `).all(parentGroupId).map((row) => row.child_group_id);
}

function getDirectMemberAssetIds(dbManager, groupId) {
    return dbManager.getDb().prepare(`
        SELECT asset_id
        FROM asset_group_members
        WHERE group_id = ?
        ORDER BY rank ASC, asset_id ASC
    `).all(groupId).map((row) => row.asset_id);
}

test('runtime near-duplicate grouping links child duplicate groups through representative units', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'near-dup-a.png');
    const secondPath = path.join(fixtureDir, 'near-dup-b.png');
    const thirdPath = path.join(fixtureDir, 'near-dup-c.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);
    createFixtureImage(thirdPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();
        const thirdId = uuidv4();
        const duplicateHash = hashFileContents(firstPath);

        seedAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: duplicateHash,
            fileSize: 2_000,
            width: 1200,
            height: 900,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: duplicateHash,
            fileSize: 6_000,
            width: 2400,
            height: 1800,
            exifDate: '2026-01-01T12:00:01.000Z',
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'near-dup-child-c',
            fileSize: 4_000,
            width: 1800,
            height: 1400,
            exifDate: '2026-01-01T12:00:02.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: duplicateHash,
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: duplicateHash,
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'near-dup-child-c',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const duplicateGroupId = getGroupId(dbManager, 'duplicate');
        const nearDuplicateGroupId = getGroupId(dbManager, 'near_duplicate');

        assert.ok(duplicateGroupId);
        assert.ok(nearDuplicateGroupId);
        assert.deepEqual(getChildGroupIds(dbManager, nearDuplicateGroupId), [duplicateGroupId]);
        assert.deepEqual(getDirectMemberAssetIds(dbManager, nearDuplicateGroupId), [thirdId]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime burst grouping links child near-duplicate groups instead of flattening their files', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'burst-a.png');
    const secondPath = path.join(fixtureDir, 'burst-b.png');
    const thirdPath = path.join(fixtureDir, 'burst-c.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);
    createFixtureImage(thirdPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();
        const thirdId = uuidv4();

        seedAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'burst-child-a',
            fileSize: 2_000,
            width: 1200,
            height: 900,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'burst-child-b',
            fileSize: 6_000,
            width: 2400,
            height: 1800,
            exifDate: '2026-01-01T12:00:01.000Z',
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'burst-child-c',
            fileSize: 4_000,
            width: 1800,
            height: 1400,
            exifDate: '2026-01-01T12:00:02.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'burst-child-a',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'burst-child-b',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'burst-child-c',
            phash64: '0000000000000fff',
            dhash64: '0000000000000fff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const nearDuplicateGroupId = getGroupId(dbManager, 'near_duplicate');
        const burstGroupId = getGroupId(dbManager, 'burst');

        assert.ok(nearDuplicateGroupId);
        assert.ok(burstGroupId);
        assert.deepEqual(getChildGroupIds(dbManager, burstGroupId), [nearDuplicateGroupId]);
        assert.deepEqual(getDirectMemberAssetIds(dbManager, burstGroupId), [thirdId]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime variant grouping links child near-duplicate groups through representative units', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'variant-a.png');
    const secondPath = path.join(fixtureDir, 'variant-b.png');
    const thirdPath = path.join(fixtureDir, 'variant-c.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);
    createFixtureImage(thirdPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();
        const thirdId = uuidv4();

        seedAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'variant-child-a',
            fileSize: 2_000,
            width: 1200,
            height: 900,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'variant-child-b',
            fileSize: 6_000,
            width: 2400,
            height: 1800,
            exifDate: '2026-01-01T12:00:01.000Z',
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'variant-child-c',
            fileSize: 4_000,
            width: 1800,
            height: 1400,
            exifDate: '2026-01-01T12:00:02.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'variant-child-a',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'variant-child-b',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'variant-child-c',
            phash64: '000000000000001f',
            dhash64: '000000000000001f',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const nearDuplicateGroupId = getGroupId(dbManager, 'near_duplicate');
        const variantGroupId = getGroupId(dbManager, 'variant_set');

        assert.ok(nearDuplicateGroupId);
        assert.ok(variantGroupId);
        assert.deepEqual(getChildGroupIds(dbManager, variantGroupId), [nearDuplicateGroupId]);
        assert.deepEqual(getDirectMemberAssetIds(dbManager, variantGroupId), [thirdId]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
