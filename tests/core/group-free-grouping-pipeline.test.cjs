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
        fileHash: params.fileHash,
        fileSize: params.fileSize,
        width: 1200,
        height: 800,
        exifDate: params.exifDate,
    });
    seedAssetFeatures(dbManager, {
        assetId: params.id,
        fileHash: params.fileHash,
        phash64: params.phash64,
        dhash64: params.dhash64,
    });
}

function normalizeUnits(units) {
    return units.map((unit) => ({
        representativeAssetId: unit.representativeAssetId,
        memberAssetIds: [...unit.memberAssetIds].sort(),
    })).sort((left, right) => {
        const leftKey = `${left.representativeAssetId}:${left.memberAssetIds.join(',')}`;
        const rightKey = `${right.representativeAssetId}:${right.memberAssetIds.join(',')}`;
        return leftKey.localeCompare(rightKey);
    });
}

function normalizeGraphComponents(graph) {
    const byId = new Map(graph.units.map((unit) => [unit.unitId, unit]));
    return graph.components.map((component) => {
        const memberAssetIds = [...new Set(component.flatMap((unitId) => byId.get(unitId)?.memberAssetIds ?? []))]
            .sort();
        return memberAssetIds;
    }).sort((left, right) => left.join(',').localeCompare(right.join(',')));
}

test('group-free hierarchy produces the accepted duplicate, near, variant and burst computational units', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const groupFree = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, {
            id: 'asset-a',
            fileHash: 'exact-a',
            fileSize: 1500,
            exifDate: '2025-01-01T10:00:00.000Z',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-a-copy',
            fileHash: 'exact-a',
            fileSize: 1800,
            exifDate: '2025-01-01T10:00:00.000Z',
            phash64: '0000000000000000',
            dhash64: '0000000000000000',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-b',
            fileHash: 'content-b',
            fileSize: 2200,
            exifDate: '2025-01-01T10:00:00.200Z',
            phash64: '0000000000000001',
            dhash64: '0000000000000001',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-c',
            fileHash: 'content-c',
            fileSize: 2000,
            exifDate: '2025-01-01T10:00:01.000Z',
            phash64: '000000000000000f',
            dhash64: '000000000000000f',
        });
        seedReadyAsset(dbManager, {
            id: 'asset-d',
            fileHash: 'content-d',
            fileSize: 1900,
            exifDate: '2025-01-01T10:00:02.000Z',
            phash64: '00000000000000ff',
            dhash64: '00000000000000ff',
        });

        const allAssetIds = ['asset-a', 'asset-a-copy', 'asset-b', 'asset-c', 'asset-d'];
        await runGroupingWorkflow({
            dbManager,
            inputSubjects: allAssetIds.map((subjectId) => ({ subjectType: 'asset', subjectId })),
        });

        const projection = groupFree.buildGroupFreeGroupingPipeline(dbManager.getDb());

        assert.deepEqual(normalizeUnits(projection.exactUnits), [
            { representativeAssetId: 'asset-a-copy', memberAssetIds: ['asset-a', 'asset-a-copy'] },
            { representativeAssetId: 'asset-b', memberAssetIds: ['asset-b'] },
            { representativeAssetId: 'asset-c', memberAssetIds: ['asset-c'] },
            { representativeAssetId: 'asset-d', memberAssetIds: ['asset-d'] },
        ]);
        assert.deepEqual(normalizeUnits(projection.nearUnits), [
            { representativeAssetId: 'asset-b', memberAssetIds: ['asset-a', 'asset-a-copy', 'asset-b'] },
            { representativeAssetId: 'asset-c', memberAssetIds: ['asset-c'] },
            { representativeAssetId: 'asset-d', memberAssetIds: ['asset-d'] },
        ]);
        assert.deepEqual(normalizeUnits(projection.variantUnits), [
            { representativeAssetId: 'asset-c', memberAssetIds: ['asset-a', 'asset-a-copy', 'asset-b', 'asset-c'] },
            { representativeAssetId: 'asset-d', memberAssetIds: ['asset-d'] },
        ]);
        assert.deepEqual(normalizeGraphComponents(projection.burstGraph), [allAssetIds.slice().sort()]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
