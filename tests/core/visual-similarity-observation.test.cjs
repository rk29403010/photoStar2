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
        fileHash: `${params.id}-hash`,
        fileSize: 1000,
        width: 1200,
        height: 800,
    });
    seedAssetFeatures(dbManager, {
        assetId: params.id,
        fileHash: `${params.id}-hash`,
        phash64: params.phash64,
        dhash64: params.dhash64,
    });
}

test('visual similarity repository canonicalises pairs and replaces impacted detector observations', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/relationships/visualSimilarityObservationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, { id: 'asset-a', phash64: '0000000000000000', dhash64: '0000000000000000' });
        seedReadyAsset(dbManager, { id: 'asset-b', phash64: '0000000000000001', dhash64: '0000000000000003' });
        seedReadyAsset(dbManager, { id: 'asset-c', phash64: '000000000000000f', dhash64: '000000000000000f' });
        const db = dbManager.getDb();

        repository.replaceVisualSimilarityObservations(db, {
            impactedAssetIds: ['asset-a', 'asset-b'],
            sourceIdentity: 'test:visual',
            sourceRef: 'test@1',
            algorithmVersion: '1',
            observations: [{
                assetIdA: 'asset-b',
                assetIdB: 'asset-a',
                phashDistance: 1,
                dhashDistance: 2,
                score: 1 - (2 / 64),
                evidence: { route: 'first' },
            }],
        });

        const first = repository.getVisualSimilarityObservationsForAsset(db, 'asset-a', 'test:visual');
        assert.equal(first.length, 1);
        assert.ok(first[0].assetIdentityGuidA < first[0].assetIdentityGuidB);
        assert.deepEqual(
            [first[0].currentAssetIdA, first[0].currentAssetIdB].sort(),
            ['asset-a', 'asset-b'],
        );
        assert.equal(first[0].phashDistance, 1);
        assert.equal(first[0].dhashDistance, 2);
        assert.equal(first[0].score, 1 - (2 / 64));

        repository.replaceVisualSimilarityObservations(db, {
            impactedAssetIds: ['asset-a'],
            sourceIdentity: 'test:visual',
            sourceRef: 'test@2',
            algorithmVersion: '2',
            observations: [{
                assetIdA: 'asset-a',
                assetIdB: 'asset-c',
                phashDistance: 4,
                dhashDistance: 4,
                score: 1 - (4 / 64),
            }],
        });

        assert.equal(repository.getVisualSimilarityObservationsForAsset(db, 'asset-b', 'test:visual').length, 0);
        const replacement = repository.getVisualSimilarityObservationsForAsset(db, 'asset-a', 'test:visual');
        assert.equal(replacement.length, 1);
        assert.deepEqual(
            [replacement[0].currentAssetIdA, replacement[0].currentAssetIdB].sort(),
            ['asset-a', 'asset-c'],
        );
        assert.equal(replacement[0].algorithmVersion, '2');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime grouping persists only the visual pairs actually measured by near and variant policies', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/relationships/visualSimilarityObservationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, { id: 'asset-a', phash64: '0000000000000000', dhash64: '0000000000000000' });
        seedReadyAsset(dbManager, { id: 'asset-b', phash64: '0000000000000001', dhash64: '0000000000000003' });
        seedReadyAsset(dbManager, { id: 'asset-c', phash64: '000000000000000f', dhash64: '000000000000000f' });

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: 'asset-a' },
                { subjectType: 'asset', subjectId: 'asset-b' },
                { subjectType: 'asset', subjectId: 'asset-c' },
            ],
        });

        const db = dbManager.getDb();
        const observations = repository.getVisualSimilarityObservationsForAsset(
            db,
            'asset-a',
            'runtime.group_similar_photos:visual_hash',
        );
        assert.equal(observations.length, 2);

        const byOtherAsset = new Map(observations.map((observation) => {
            const otherAssetId = observation.currentAssetIdA === 'asset-a'
                ? observation.currentAssetIdB
                : observation.currentAssetIdA;
            return [otherAssetId, observation];
        }));
        const near = byOtherAsset.get('asset-b');
        assert.ok(near);
        assert.equal(near.phashDistance, 1);
        assert.equal(near.dhashDistance, 2);
        assert.equal(near.score, 1 - (2 / 64));
        assert.deepEqual(JSON.parse(near.evidenceJson).routes.map((route) => route.policy), ['near_duplicate']);

        const variant = byOtherAsset.get('asset-c');
        assert.ok(variant);
        assert.equal(variant.phashDistance, 4);
        assert.equal(variant.dhashDistance, 4);
        assert.equal(variant.score, 1 - (4 / 64));
        assert.deepEqual(JSON.parse(variant.evidenceJson).routes.map((route) => route.policy), ['variant']);

        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visual_similarity_observations').get().count, 2);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_propositions').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_decisions').get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
