const test = require('node:test');
const assert = require('node:assert/strict');

function buildAsset(id, createdAt, groupId) {
    return {
        id,
        original_path: `${id}.jpg`,
        created_at: createdAt,
        photo_created_at: createdAt,
        group_id: groupId,
        group_role: 'canonical',
        stack_count: 99,
    };
}

function buildPresentationItem({ key, representativeAssetId, assetIds, stackCount, relationshipKind }) {
    return {
        presentationKey: key,
        representativeAssetId,
        assetIds,
        stackCount,
        relationshipKind,
        momentCount: relationshipKind === 'capture_sequence' ? 2 : 1,
    };
}

test('collapsed gallery follows presentation order and ignores misleading legacy group identity', async () => {
    const { buildVisibleGalleryItems } = await import('../../src/shared/utils/libraryGallerySelection.ts');
    const assetA = buildAsset('asset-a', '2025-01-01T00:00:00.000Z', 'wrong-group-a');
    const assetB = buildAsset('asset-b', '2026-01-01T00:00:00.000Z', 'wrong-group-b');
    const assets = [assetA, assetB];
    const presentationItems = [
        buildPresentationItem({
            key: 'sequence:real-stack',
            representativeAssetId: 'asset-a',
            assetIds: ['asset-a', 'asset-member'],
            stackCount: 2,
            relationshipKind: 'capture_sequence',
        }),
        buildPresentationItem({
            key: 'asset:asset-b',
            representativeAssetId: 'asset-b',
            assetIds: ['asset-b'],
            stackCount: 1,
            relationshipKind: null,
        }),
    ];

    const items = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: true,
        sortMode: 'date',
        presentationItems,
    });

    assert.deepEqual(items.map((item) => item.photoId), ['asset-a', 'asset-b']);
    assert.deepEqual(items.map((item) => item.selectionKey), ['group:sequence:real-stack', 'photo:asset-b']);
    assert.equal(items[0].groupId, 'sequence:real-stack');
    assert.equal(items[0].asset.stack_count, 2);
    assert.equal(items[0].asset.group_id, 'wrong-group-a');
    assert.equal(items[1].entityType, 'photo');
    assert.equal(items[1].groupId, null);
    assert.equal(assetA.stack_count, 99, 'view projection must not mutate the cached Asset');
});

test('presentation declustering is a stable partition and does not re-sort server order', async () => {
    const { buildVisibleGalleryItems } = await import('../../src/shared/utils/libraryGallerySelection.ts');
    const assets = [
        buildAsset('first', '2024-01-01T00:00:00.000Z', 'legacy-first'),
        buildAsset('second', '2026-01-01T00:00:00.000Z', 'legacy-second'),
        buildAsset('third', '2025-01-01T00:00:00.000Z', 'legacy-third'),
    ];
    const presentationItems = [
        buildPresentationItem({ key: 'asset:first', representativeAssetId: 'first', assetIds: ['first'], stackCount: 1, relationshipKind: null }),
        buildPresentationItem({ key: 'asset:second', representativeAssetId: 'second', assetIds: ['second'], stackCount: 1, relationshipKind: null }),
        buildPresentationItem({ key: 'asset:third', representativeAssetId: 'third', assetIds: ['third'], stackCount: 1, relationshipKind: null }),
    ];

    const items = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: true,
        sortMode: 'date',
        presentationItems,
        declusteredAssetIds: new Set(['second']),
    });

    assert.deepEqual(items.map((item) => item.photoId), ['first', 'third', 'second']);
});

test('ungrouped gallery ignores presentation items and keeps raw asset sorting', async () => {
    const { buildVisibleGalleryItems } = await import('../../src/shared/utils/libraryGallerySelection.ts');
    const assets = [
        buildAsset('older', '2024-01-01T00:00:00.000Z', 'legacy-older'),
        buildAsset('newer', '2026-01-01T00:00:00.000Z', 'legacy-newer'),
    ];
    const presentationItems = [
        buildPresentationItem({ key: 'asset:older', representativeAssetId: 'older', assetIds: ['older'], stackCount: 1, relationshipKind: null }),
    ];

    const items = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: false,
        sortMode: 'date',
        presentationItems,
    });

    assert.deepEqual(items.map((item) => item.photoId), ['newer', 'older']);
    assert.deepEqual(items.map((item) => item.selectionKey), ['photo:newer', 'photo:older']);
});
