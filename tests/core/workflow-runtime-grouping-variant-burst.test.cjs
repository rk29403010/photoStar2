const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const {
    createFixtureImage,
    createTempDir,
    runGroupingWorkflow,
    seedAsset,
    seedAssetFeatures,
    seedSimilarityGroup,
} = require('./workflow-runtime-grouping.helpers.cjs');

test('runtime variant grouping does not merge transitive visual neighbors into one group', async () => {
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
            phash64: '000000000000001f',
            dhash64: '000000000000001f',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'hash-b',
            phash64: '00000000000000f8',
            dhash64: '00000000000000f8',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'hash-c',
            phash64: '00000000000007c0',
            dhash64: '00000000000007c0',
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
            variantMembers.map((row) => row.asset_id).sort(),
            [firstId, secondId].sort(),
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

test('runtime burst grouping rejects phash-only matches when dhash disagrees', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'burst-one.png');
    const secondPath = path.join(fixtureDir, 'burst-two.png');
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
            fileHash: 'burst-reject-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'burst-reject-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'burst-reject-a',
            phash64: 'bd89898d818181ff',
            dhash64: '96e6eee6e6e4d0c0',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'burst-reject-b',
            phash64: '81818d8d8d8181ff',
            dhash64: 'be92a6a6a696b2b8',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const burstGroupCount = dbManager.getDb().prepare(`
            SELECT COUNT(*) AS count
            FROM asset_groups
            WHERE type = 'burst'
        `).get();

        assert.equal(burstGroupCount.count, 0);
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
            phash64: '000000000000001f',
            dhash64: '000000000000001f',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'stale-hash-b',
            phash64: '00000000000000f8',
            dhash64: '00000000000000f8',
        });
        seedAssetFeatures(dbManager, {
            assetId: thirdId,
            fileHash: 'stale-hash-c',
            phash64: '00000000000007c0',
            dhash64: '00000000000007c0',
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
            variantGroups.map((row) => row.asset_id).sort(),
            [firstId, secondId].sort(),
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
