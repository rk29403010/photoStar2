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
} = require('./workflow-runtime-grouping.helpers.cjs');

function seedVisualAsset(dbManager, params) {
    seedAsset(dbManager, {
        id: params.id,
        originalPath: params.originalPath,
        fileHash: params.fileHash,
        fileSize: params.fileSize,
        width: params.width,
        height: params.height,
        exifDate: params.exifDate,
    });
    seedAssetFeatures(dbManager, {
        assetId: params.id,
        fileHash: params.fileHash,
        phash64: params.phash64,
        dhash64: params.dhash64,
    });
}

function getBurstComponentMembers(graph, assetId) {
    const unitsById = new Map(graph.units.map((unit) => [unit.unitId, unit]));
    return graph.components
        .map((component) => [...new Set(component.flatMap((unitId) => unitsById.get(unitId)?.memberAssetIds ?? []))])
        .find((assetIds) => assetIds.includes(assetId));
}

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
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();
        const thirdId = uuidv4();

        seedVisualAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
            phash64: '000000000000001f',
            dhash64: '000000000000001f',
        });
        seedVisualAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
            phash64: '00000000000000f8',
            dhash64: '00000000000000f8',
        });
        seedVisualAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'hash-c',
            fileSize: 12,
            width: 402,
            height: 302,
            exifDate: '2026-01-01T12:00:02.000Z',
            phash64: '00000000000007c0',
            dhash64: '00000000000007c0',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());
        const variantUnit = projection.variantUnits.find((unit) => unit.memberAssetIds.includes(firstId));
        assert.ok(variantUnit);
        assert.deepEqual([...variantUnit.memberAssetIds].sort(), [firstId, secondId].sort());
        assert.ok(!variantUnit.memberAssetIds.includes(thirdId));
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
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();
        const thirdId = uuidv4();

        seedVisualAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'burst-hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedVisualAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'burst-hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:02.000Z',
            phash64: '00000000000003ff',
            dhash64: '00000000000003ff',
        });
        seedVisualAsset(dbManager, {
            id: thirdId,
            originalPath: thirdPath,
            fileHash: 'burst-hash-c',
            fileSize: 12,
            width: 402,
            height: 302,
            exifDate: '2026-01-01T12:00:04.000Z',
            phash64: '0000000000000fff',
            dhash64: '0000000000000fff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());
        const burstMembers = getBurstComponentMembers(projection.burstGraph, firstId);
        assert.ok(burstMembers);
        assert.deepEqual([...burstMembers].sort(), [firstId, secondId, thirdId].sort());
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
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();

        seedVisualAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'burst-reject-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
            phash64: 'bd89898d818181ff',
            dhash64: '96e6eee6e6e4d0c0',
        });
        seedVisualAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'burst-reject-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
            phash64: '81818d8d8d8181ff',
            dhash64: 'be92a6a6a696b2b8',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());
        const burstMembers = getBurstComponentMembers(projection.burstGraph, firstId);
        assert.ok(burstMembers);
        assert.equal(burstMembers.includes(secondId), false);
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
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const firstId = uuidv4();
        const secondId = uuidv4();

        seedVisualAsset(dbManager, {
            id: firstId,
            originalPath: firstPath,
            fileHash: 'hash-a',
            fileSize: 10,
            width: 400,
            height: 300,
            exifDate: '2026-01-01T12:00:00.000Z',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedVisualAsset(dbManager, {
            id: secondId,
            originalPath: secondPath,
            fileHash: 'hash-b',
            fileSize: 11,
            width: 401,
            height: 301,
            exifDate: '2026-01-01T12:00:01.000Z',
            phash64: '00000000000003ff',
            dhash64: 'ffffffffffffffff',
        });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [{ subjectType: 'asset', subjectId: firstId }],
        });

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());
        const variantUnit = projection.variantUnits.find((unit) => unit.memberAssetIds.includes(firstId));
        assert.ok(variantUnit);
        assert.equal(variantUnit.memberAssetIds.includes(secondId), false);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
