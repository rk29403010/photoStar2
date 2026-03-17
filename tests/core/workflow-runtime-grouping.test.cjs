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
    seedDuplicateGroup,
    seedSimilarityGroup,
} = require('./workflow-runtime-grouping.helpers.cjs');

test('runtime grouping writes duplicate groups for changed assets', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();

        seedAsset(dbManager, { id: firstId, originalPath: firstPath });
        seedAsset(dbManager, { id: secondId, originalPath: secondPath });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: firstId },
                { subjectType: 'asset', subjectId: secondId },
            ],
        });

        const duplicateGroups = dbManager.getDb().prepare(`
            SELECT g.id, m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'duplicate'
        `).all();

        assert.equal(duplicateGroups.length, 2);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime grouping backfills missing hashes and dimensions before grouping', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();

        seedAsset(dbManager, { id: firstId, originalPath: firstPath });
        seedAsset(dbManager, { id: secondId, originalPath: secondPath });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: firstId },
                { subjectType: 'asset', subjectId: secondId },
            ],
        });

        const firstAsset = dbManager.getDb().prepare(`
            SELECT file_hash, width, height
            FROM assets
            WHERE id = ?
        `).get(firstId);
        const firstFeature = dbManager.getDb().prepare(`
            SELECT phash64, dhash64
            FROM asset_features
            WHERE asset_id = ?
        `).get(firstId);

        assert.ok(firstAsset.file_hash);
        assert.ok(firstAsset.width > 0);
        assert.ok(firstAsset.height > 0);
        assert.ok(firstFeature.phash64);
        assert.ok(firstFeature.dhash64);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime grouping preserves locked duplicate groups for impacted assets', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();
        const duplicateHash = hashFileContents(secondPath);

        seedAsset(dbManager, { id: firstId, originalPath: firstPath });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: duplicateHash,
            fileSize: fs.statSync(secondPath).size,
            width: 1,
            height: 1,
        });
        seedDuplicateGroup(dbManager, {
            groupId: uuidv4(),
            status: 'locked',
            canonicalAssetId: firstId,
            assetIds: [firstId, secondId],
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const duplicateGroups = dbManager.getDb().prepare(`
            SELECT COUNT(*) AS count
            FROM asset_groups
            WHERE type = 'duplicate'
        `).get();

        assert.equal(duplicateGroups.count, 1);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime duplicate grouping matches changed assets against older library assets', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const oldPath = path.join(fixtureDir, 'old.png');
    const newPath = path.join(fixtureDir, 'new.png');
    createFixtureImage(oldPath);
    createFixtureImage(newPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const oldId = uuidv4();
        const newId = uuidv4();
        const duplicateHash = hashFileContents(oldPath);

        seedAsset(dbManager, {
            id: oldId,
            originalPath: oldPath,
            fileHash: duplicateHash,
            fileSize: fs.statSync(oldPath).size,
            width: 1,
            height: 1,
        });
        seedAsset(dbManager, {
            id: newId,
            originalPath: newPath,
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: newId }],
        });

        const duplicateMembers = dbManager.getDb().prepare(`
            SELECT m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'duplicate'
            ORDER BY m.rank ASC
        `).all();

        assert.deepEqual(
            duplicateMembers.map((row) => row.asset_id).sort(),
            [oldId, newId].sort(),
        );
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime variant grouping merges transitive visual neighbors into one group', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    const thirdPath = path.join(fixtureDir, 'three.png');
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
            fileHash: 'hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'hash-c',
            fileSize: 12,
            width: 402,
            height: 302,
            exifDate: '2026-01-01T12:00:02.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'hash-a',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'hash-b',
            phash64: '00000000000003ff',
            dhash64: '00000000000003ff',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'hash-c',
            phash64: '0000000000000fff',
            dhash64: '0000000000000fff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const variantMembers = dbManager.getDb().prepare(`
            SELECT m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'variant_set'
            ORDER BY m.rank ASC
        `).all();

        assert.deepEqual(
            variantMembers.map((row) => row.asset_id),
            [thirdId, secondId, firstId],
        );
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime burst grouping merges transitive time-neighbours into one group', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    const thirdPath = path.join(fixtureDir, 'three.png');
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
            fileHash: 'burst-hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'burst-hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:02.000Z',
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'burst-hash-c',
            fileSize: 12,
            width: 402,
            height: 302,
            exifDate: '2026-01-01T12:00:04.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'burst-hash-a',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'burst-hash-b',
            phash64: '00000000000003ff',
            dhash64: '00000000000003ff',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'burst-hash-c',
            phash64: '0000000000000fff',
            dhash64: '0000000000000fff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const burstMembers = dbManager.getDb().prepare(`
            SELECT m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'burst'
            ORDER BY m.rank ASC
        `).all();

        assert.deepEqual(
            burstMembers.map((row) => row.asset_id),
            [thirdId, secondId, firstId],
        );
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime variant grouping replaces stale proposed groups for impacted assets', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    const thirdPath = path.join(fixtureDir, 'three.png');
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
            fileHash: 'stale-hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'stale-hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'stale-hash-c',
            fileSize: 12,
            width: 402,
            height: 302,
            exifDate: '2026-01-01T12:00:02.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'stale-hash-a',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'stale-hash-b',
            phash64: '00000000000003ff',
            dhash64: '00000000000003ff',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'stale-hash-c',
            phash64: '0000000000000fff',
            dhash64: '0000000000000fff',
        });
        seedSimilarityGroup(dbManager, {
            groupId: uuidv4(),
            type: 'variant_set',
            status: 'proposed',
            canonicalAssetId: firstId,
            assetIds: [firstId, thirdId],
            paramsJson: { threshold: 10 },
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const variantGroups = dbManager.getDb().prepare(`
            SELECT g.id, m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'variant_set'
            ORDER BY g.id ASC, m.rank ASC
        `).all();

        assert.deepEqual(
            variantGroups.map((row) => row.asset_id),
            [thirdId, secondId, firstId],
        );
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime variant grouping rejects phash-only bridge matches when dhash disagrees', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'one.png');
    const secondPath = path.join(fixtureDir, 'two.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();

        seedAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'hash-a',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'hash-b',
            phash64: '00000000000003ff',
            dhash64: 'ffffffffffffffff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const variantGroupCount = dbManager.getDb().prepare(`
            SELECT COUNT(*) AS count
            FROM asset_groups
            WHERE type = 'variant_set'
        `).get();

        assert.equal(variantGroupCount.count, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
