const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createTempDir, seedAsset, seedAssetFeatures } = require('./workflow-runtime-grouping.helpers.cjs');

const groupingRoot = '../../dist/core/src/services/workflowRuntime/modules/grouping/';
const evidence = { measurement: 'spatial-gradient-v1', gradientCosine: 0.91, dhashDistance: 8, aspectRatioDelta: 0.02 };

function unit(id, phash64, dhash64) {
    return {
        unitId: `asset:${id}`, representativeAssetId: id, memberAssetIds: [id],
        sourceGroupId: null, originalPath: `C:/photos/${id}.jpg`, fileHash: `${id}-hash`,
        fileSize: 1000, width: 1200, height: 800, exifDatetime: null, phash64, dhash64,
    };
}

test('structural variants are reachable from either changed endpoint but remain anchored and outside near duplicates', async () => {
    const queries = await import(`${groupingRoot}groupingQueries.js`);
    const units = [
        unit('a', '0000000000000000', '0000000000000000'),
        unit('b', '0000000007ffffff', '00000000000000ff'),
        unit('c', 'ffffffffffffffff', '000000000000ffff'),
    ];
    const structureMatches = new Map([['a\nb', evidence], ['b\nc', evidence]]);
    for (const changed of ['a', 'b', 'c']) {
        const graph = queries.buildVariantGroupingGraphFromUnits({ units, changedAssetIds: [changed], threshold: 6, structureMatches });
        assert.equal(graph.units.length, 3);
        assert.deepEqual(graph.components, [['asset:a', 'asset:b']]);
        assert.equal(graph.edges[0].score, evidence.gradientCosine);
        assert.deepEqual(graph.edges[0].evidence, evidence);
    }
    const near = queries.buildNearDuplicateGroupingGraphFromUnits({ units, changedAssetIds: ['a', 'b', 'c'], threshold: 2 });
    assert.equal(near.edges.length, 0);
});

test('structural variant provenance survives persistence and presentation with real hashes and unaffected incremental groups', async () => {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { buildIncrementalGroupFreeGroupingPipeline } = await import(`${groupingRoot}groupFreeIncrementalPipeline.js`);
    const { syncVisualSimilarityObservations } = await import(`${groupingRoot}visualSimilarityProjection.js`);
    const { getVisualSimilarityPresentationPage } = await import('../../dist/core/src/services/relationships/libraryVisualSimilarityPresentationProjection.js');
    const tempDir = createTempDir();
    const dbManager = new DatabaseManager(tempDir);
    try {
        for (const asset of [unit('a', '0000000000000000', '0000000000000000'), unit('b', '0000000007ffffff', '00000000000000ff'), unit('c', 'ffffffffffffffff', 'ffffffffffffffff')]) {
            seedAsset(dbManager, { id: asset.representativeAssetId, originalPath: asset.originalPath, fileHash: asset.fileHash, fileSize: asset.fileSize, width: asset.width, height: asset.height });
            seedAssetFeatures(dbManager, { assetId: asset.representativeAssetId, fileHash: asset.fileHash, phash64: asset.phash64, dhash64: asset.dhash64 });
        }
        const db = dbManager.getDb();
        const refresh = (changedAssetIds, structureMatches) => {
            const pipeline = buildIncrementalGroupFreeGroupingPipeline(db, changedAssetIds, structureMatches);
            syncVisualSimilarityObservations({
                db,
                nearDuplicate: { changedAssetIds: pipeline.refresh.nearDuplicate.impactedAssetIds, graph: { ...pipeline.refresh.nearDuplicate.graph, threshold: 2 } },
                variant: { changedAssetIds: pipeline.refresh.variant.impactedAssetIds, graph: { ...pipeline.refresh.variant.graph, threshold: 6 } },
            });
            return pipeline;
        };
        refresh(['b'], new Map([['a\nb', evidence]]));
        const observation = db.prepare('SELECT * FROM visual_similarity_observations').get();
        assert.equal(observation.phash_distance, 27);
        assert.equal(observation.dhash_distance, 8);
        assert.equal(observation.score, 0.91);
        assert.equal(observation.algorithm_version, '2.0');
        assert.equal(JSON.parse(observation.evidence_json).measurement, evidence.measurement);
        const page = () => getVisualSimilarityPresentationPage(db, { limit: 20, offset: 0 });
        assert.deepEqual(page().find((item) => item.relationshipKind === 'variant').assetIds, ['a', 'b']);
        const unaffected = refresh(['c']);
        assert.ok(unaffected.variantUnits.some((item) => item.memberAssetIds.length === 2));
        assert.equal(page().length, 2);
        for (const invalid of [{ ...evidence, gradientCosine: 0.79 }, { ...evidence, dhashDistance: 7 }, { ...evidence, aspectRatioDelta: 0.2 }]) {
            db.prepare('UPDATE visual_similarity_observations SET evidence_json = ?').run(JSON.stringify(invalid));
            assert.equal(page().length, 3);
        }
        db.prepare('UPDATE visual_similarity_observations SET evidence_json = ?').run('{bad json');
        assert.equal(page().length, 3);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
