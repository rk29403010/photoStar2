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
} = require('./workflow-runtime-grouping.helpers.cjs');

test('database schema includes direct child-group links for similarity hierarchy', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const childTable = dbManager.getDb().prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'asset_group_children'
        `).get();

        assert.deepEqual(childTable, { name: 'asset_group_children' });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('grouping hierarchy helpers prefer quality for duplicates and recency for variants', async () => {
    const {
        selectDuplicateRepresentative,
        selectVariantRepresentative,
    } = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupingHierarchy.js');

    const duplicateRepresentative = selectDuplicateRepresentative([
        {
            id: 'asset-low',
            originalPath: 'C:/photos/low.jpg',
            fileSize: 2_000,
            width: 1200,
            height: 900,
            exifDatetime: '2026-01-01T10:00:00.000Z',
        },
        {
            id: 'asset-high',
            originalPath: 'C:/photos/high.png',
            fileSize: 6_000,
            width: 2400,
            height: 1800,
            exifDatetime: '2026-01-01T09:00:00.000Z',
        },
    ]);
    const variantRepresentative = selectVariantRepresentative([
        {
            id: 'asset-old',
            originalPath: 'C:/photos/edit-old.jpg',
            fileSize: 5_000,
            width: 2000,
            height: 1500,
            exifDatetime: '2026-01-01T09:00:00.000Z',
            createdAt: '2026-01-01T09:00:00.000Z',
        },
        {
            id: 'asset-new',
            originalPath: 'C:/photos/edit-new.jpg',
            fileSize: 4_000,
            width: 1800,
            height: 1400,
            exifDatetime: '2026-01-01T11:00:00.000Z',
            createdAt: '2026-01-01T11:00:00.000Z',
        },
    ]);

    assert.equal(duplicateRepresentative.id, 'asset-high');
    assert.equal(variantRepresentative.id, 'asset-new');
});

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

test('runtime duplicate grouping replaces stale subset groups when a new duplicate expands the set', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'first.png');
    const secondPath = path.join(fixtureDir, 'second.png');
    const thirdPath = path.join(fixtureDir, 'third.png');
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
            fileSize: fs.statSync(firstPath).size,
            width: 1,
            height: 1,
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: duplicateHash,
            fileSize: fs.statSync(secondPath).size,
            width: 1,
            height: 1,
        });
        seedAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
        });
        seedDuplicateGroup(dbManager, {
            groupId: uuidv4(),
            status: 'confirmed',
            canonicalAssetId: firstId,
            assetIds: [firstId, secondId],
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: thirdId }],
        });

        const duplicateGroups = dbManager.getDb().prepare(`
            SELECT g.id, m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'duplicate'
            ORDER BY g.id ASC, m.rank ASC
        `).all();

        assert.equal(new Set(duplicateGroups.map((row) => row.id)).size, 1);
        assert.deepEqual(
            duplicateGroups.map((row) => row.asset_id).sort(),
            [firstId, secondId, thirdId].sort(),
        );
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime grouping persists near-duplicate groups for same-content assets with different file identities', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'near-one.png');
    const secondPath = path.join(fixtureDir, 'near-two.png');
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
            fileHash: 'near-hash-a',
            fileSize: 2_000,
            width: 1200,
            height: 900,
            exifDate: '2026-01-01T12:00:00.000Z',
        });
        seedAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'near-hash-b',
            fileSize: 6_000,
            width: 2400,
            height: 1800,
            exifDate: '2026-01-01T12:00:01.000Z',
        });

        seedAssetFeatures(dbManager, {
            assetId: firstId,
            fileHash: 'near-hash-a',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedAssetFeatures(dbManager, {
            assetId: secondId,
            fileHash: 'near-hash-b',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const nearDuplicateMembers = dbManager.getDb().prepare(`
            SELECT g.canonical_asset_id AS canonical_asset_id, m.asset_id
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE g.type = 'near_duplicate'
            ORDER BY m.rank ASC
        `).all();

        assert.equal(nearDuplicateMembers.length, 2);
        assert.equal(nearDuplicateMembers[0].canonical_asset_id, secondId);
        assert.deepEqual(
            nearDuplicateMembers.map((row) => row.asset_id).sort(),
            [firstId, secondId].sort(),
        );
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
