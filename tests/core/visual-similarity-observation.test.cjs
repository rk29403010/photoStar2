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

test('visual similarity repository canonicalises pairs and replaces only the impacted policy', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/relationships/visualSimilarityObservationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, { id: 'asset-a', phash64: '0000000000000000', dhash64: '0000000000000000' });
        seedReadyAsset(dbManager, { id: 'asset-b', phash64: '0000000000000001', dhash64: '0000000000000003' });
        seedReadyAsset(dbManager, { id: 'asset-c', phash64: '000000000000000f', dhash64: '000000000000000f' });
        const db = dbManager.getDb();

        repository.replaceVisualSimilarityPolicyObservations(db, {
            impactedAssetIds: ['asset-a', 'asset-b'],
            policy: 'near_duplicate',
            sourceIdentity: 'test:visual',
            sourceRef: 'test@1',
            algorithmVersion: '1',
            observations: [{
                assetIdA: 'asset-b',
                assetIdB: 'asset-a',
                phashDistance: 1,
                dhashDistance: 2,
                score: 1 - (2 / 64),
                evidence: { route: 'near' },
            }],
        });
        repository.replaceVisualSimilarityPolicyObservations(db, {
            impactedAssetIds: ['asset-a', 'asset-b'],
            policy: 'variant',
            sourceIdentity: 'test:visual',
            sourceRef: 'test@1',
            algorithmVersion: '1',
            observations: [{
                assetIdA: 'asset-a',
                assetIdB: 'asset-b',
                phashDistance: 1,
                dhashDistance: 2,
                score: 1 - (2 / 64),
                evidence: { route: 'variant' },
            }],
        });

        const first = repository.getVisualSimilarityObservationsForAsset(db, 'asset-a', 'test:visual');
        assert.equal(first.length, 2);
        assert.deepEqual(first.map((row) => row.policy), ['near_duplicate', 'variant']);
        assert.ok(first.every((row) => row.assetIdentityGuidA < row.assetIdentityGuidB));

        repository.replaceVisualSimilarityPolicyObservations(db, {
            impactedAssetIds: ['asset-a'],
            policy: 'near_duplicate',
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

        const assetB = repository.getVisualSimilarityObservationsForAsset(db, 'asset-b', 'test:visual');
        assert.equal(assetB.length, 1);
        assert.equal(assetB[0].policy, 'variant');
        const replacement = repository.getVisualSimilarityObservationsForAsset(
            db,
            'asset-a',
            'test:visual',
            'near_duplicate',
        );
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

test('runtime grouping persists group-free visual observations without legacy group persistence', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/relationships/visualSimilarityObservationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, { id: 'asset-a', phash64: '0000000000000000', dhash64: '0000000000000000' });
        seedReadyAsset(dbManager, { id: 'asset-b', phash64: '0000000000000001', dhash64: '0000000000000003' });
        seedReadyAsset(dbManager, { id: 'asset-c', phash64: '000000000000000f', dhash64: '000000000000000f' });
        const db = dbManager.getDb();

        await runGroupingWorkflow({
            dbManager,
            inputSubjects: [
                { subjectType: 'asset', subjectId: 'asset-a' },
                { subjectType: 'asset', subjectId: 'asset-b' },
                { subjectType: 'asset', subjectId: 'asset-c' },
            ],
        });

        const observations = repository.getVisualSimilarityObservationsForAsset(
            db,
            'asset-a',
            'runtime.group_similar_photos:visual_hash',
        );
        assert.equal(observations.length, 2);
        const byPolicy = new Map(observations.map((observation) => [observation.policy, observation]));

        const near = byPolicy.get('near_duplicate');
        assert.ok(near);
        assert.deepEqual([near.currentAssetIdA, near.currentAssetIdB].sort(), ['asset-a', 'asset-b']);
        assert.equal(near.phashDistance, 1);
        assert.equal(near.dhashDistance, 2);
        assert.equal(near.score, 1 - (2 / 64));
        const nearEvidence = JSON.parse(near.evidenceJson);
        assert.equal(nearEvidence.measurement, 'phash64+dhash64');
        assert.equal(nearEvidence.threshold, 2);
        assert.equal(typeof nearEvidence.leftUnitId, 'string');
        assert.equal(typeof nearEvidence.rightUnitId, 'string');
        assert.equal(JSON.stringify(nearEvidence).includes('near_duplicate'), false);

        const variant = byPolicy.get('variant');
        assert.ok(variant);
        assert.deepEqual([variant.currentAssetIdA, variant.currentAssetIdB].sort(), ['asset-a', 'asset-c']);
        assert.equal(variant.phashDistance, 4);
        assert.equal(variant.dhashDistance, 4);
        assert.equal(variant.score, 1 - (4 / 64));
        const variantEvidence = JSON.parse(variant.evidenceJson);
        assert.equal(variantEvidence.measurement, 'phash64+dhash64');
        assert.equal(variantEvidence.threshold, 6);
        assert.equal(typeof variantEvidence.leftUnitId, 'string');
        assert.equal(typeof variantEvidence.rightUnitId, 'string');
        assert.equal(JSON.stringify(variantEvidence).includes('variant'), false);

        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visual_similarity_observations').get().count, 2);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_propositions').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_decisions').get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
