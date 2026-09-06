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
    return graph.components.map((component) => (
        [...new Set(component.flatMap((unitId) => byId.get(unitId)?.memberAssetIds ?? []))].sort()
    )).sort((left, right) => left.join(',').localeCompare(right.join(',')));
}

function clearLegacyGroups(db) {
    db.prepare('DELETE FROM asset_group_children').run();
    db.prepare('DELETE FROM asset_group_members').run();
    db.prepare('DELETE FROM asset_groups').run();
}

function poisonVisualObservationEvidence(db) {
    db.prepare(`
        UPDATE visual_similarity_observations
        SET evidence_json = '{"measurement":"phash64+dhash64","routes":[{"policy":"bogus"}]}'
        WHERE source_identity = 'runtime.group_similar_photos:visual_hash'
    `).run();
}

function assertPipelineParity(actual, expected) {
    assert.deepEqual(normalizeUnits(actual.exactUnits), normalizeUnits(expected.exactUnits));
    assert.deepEqual(normalizeUnits(actual.nearUnits), normalizeUnits(expected.nearUnits));
    assert.deepEqual(normalizeUnits(actual.variantUnits), normalizeUnits(expected.variantUnits));
    assert.deepEqual(normalizeGraphComponents(actual.burstGraph), normalizeGraphComponents(expected.burstGraph));
}

test('partial group-free reconstruction replaces stale visual neighbourhoods using stored observations', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const fullPipeline = await import(
        '../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeGroupingPipeline.js'
    );
    const incrementalPipeline = await import(
        '../../dist/core/src/services/workflowRuntime/modules/grouping/groupFreeIncrementalPipeline.js'
    );
    const dbManager = new DatabaseManager(tempDir);

    try {
        const fixtures = [
            ['asset-a', 'exact-a', 1500, '2025-01-01T10:00:00.000Z', '0000000000000000'],
            ['asset-a-copy', 'exact-a', 1800, '2025-01-01T10:00:00.000Z', '0000000000000000'],
            ['asset-b', 'content-b', 2200, '2025-01-01T10:00:00.200Z', '0000000000000001'],
            ['asset-c', 'content-c', 2000, '2025-01-01T10:00:01.000Z', '000000000000000f'],
            ['asset-d', 'content-d', 1900, '2025-01-01T10:00:02.000Z', '00000000000000ff'],
        ];
        for (const [id, fileHash, fileSize, exifDate, visualHash] of fixtures) {
            seedReadyAsset(dbManager, {
                id,
                fileHash,
                fileSize,
                exifDate,
                phash64: visualHash,
                dhash64: visualHash,
            });
        }

        const allAssetIds = fixtures.map(([id]) => id);
        await runGroupingWorkflow({
            dbManager,
            inputSubjects: allAssetIds.map((subjectId) => ({ subjectType: 'asset', subjectId })),
        });

        const db = dbManager.getDb();
        const observationCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM visual_similarity_observations
            WHERE source_identity = 'runtime.group_similar_photos:visual_hash'
        `).get().count;
        assert.ok(observationCount > 0);
        poisonVisualObservationEvidence(db);

        clearLegacyGroups(db);

        db.prepare(`
            UPDATE asset_features
            SET phash64 = ?, dhash64 = ?, updated_at = CURRENT_TIMESTAMP
            WHERE asset_id = 'asset-c'
        `).run('0000000000000003', '0000000000000003');

        const expected = fullPipeline.buildGroupFreeGroupingPipeline(db);
        const actual = incrementalPipeline.buildIncrementalGroupFreeGroupingPipeline(db, ['asset-c']);
        assertPipelineParity(actual, expected);

        assert.deepEqual(normalizeUnits(actual.nearUnits), [
            {
                representativeAssetId: 'asset-b',
                memberAssetIds: ['asset-a', 'asset-a-copy', 'asset-b', 'asset-c'],
            },
            { representativeAssetId: 'asset-d', memberAssetIds: ['asset-d'] },
        ]);
        assert.deepEqual(normalizeUnits(actual.variantUnits), normalizeUnits(actual.nearUnits));
        assert.deepEqual(normalizeGraphComponents(actual.burstGraph), [allAssetIds.slice().sort()]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
