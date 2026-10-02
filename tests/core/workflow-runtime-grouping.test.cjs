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

test('database schema omits legacy asset-group hierarchy tables', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const legacyTables = dbManager.getDb().prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name IN ('asset_groups', 'asset_group_members', 'asset_group_children')
            ORDER BY name
        `).all();

        assert.deepEqual(legacyTables, []);
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

test('runtime duplicate grouping matches changed assets against older library assets', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const oldPath = path.join(fixtureDir, 'old.png');
    const newPath = path.join(fixtureDir, 'new.png');
    createFixtureImage(oldPath);
    createFixtureImage(newPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
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

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());
        const duplicateUnit = projection.exactUnits.find((unit) => unit.memberAssetIds.includes(newId));
        assert.ok(duplicateUnit);
        assert.deepEqual([...duplicateUnit.memberAssetIds].sort(), [oldId, newId].sort());
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime grouping preserves near-duplicate behavior for same-content assets with different file identities', async () => {
    const tempDir = createTempDir();
    const fixtureDir = path.join(tempDir, 'fixtures');
    const firstPath = path.join(fixtureDir, 'near-one.png');
    const secondPath = path.join(fixtureDir, 'near-two.png');
    createFixtureImage(firstPath);
    createFixtureImage(secondPath);

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
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

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());
        const nearDuplicateUnit = projection.nearUnits.find((unit) => unit.memberAssetIds.includes(firstId));
        assert.ok(nearDuplicateUnit);
        assert.equal(nearDuplicateUnit.representativeAssetId, secondId);
        assert.deepEqual([...nearDuplicateUnit.memberAssetIds].sort(), [firstId, secondId].sort());
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
