const test = require('node:test');
const assert = require('node:assert/strict');

function buildAsset(id, createdAt) {
    return {
        id,
        original_path: `${id}.jpg`,
        created_at: createdAt,
        photo_created_at: createdAt,
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

test('collapsed gallery follows presentation order and attaches presentation metadata to its display asset', async () => {
    const { buildVisibleGalleryItems } = await import('../../src/shared/utils/libraryGallerySelection.ts');
    const assetA = buildAsset('asset-a', '2025-01-01T00:00:00.000Z');
    const assetB = buildAsset('asset-b', '2026-01-01T00:00:00.000Z');
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
    assert.equal(items[0].presentation, presentationItems[0]);
    assert.equal(items[0].asset.libraryPresentation, presentationItems[0]);
    assert.equal(items[0].asset.libraryPresentation.stackCount, 2);
    assert.equal(items[1].entityType, 'photo');
    assert.equal(items[1].groupId, null);
    assert.equal(items[1].presentation, presentationItems[1]);
    assert.equal(items[1].asset.libraryPresentation, presentationItems[1]);
    assert.equal(assetA.libraryPresentation, undefined, 'view projection must not mutate the cached Asset');
});

test('selected semantic stack expands bulk actions from presentation membership', async () => {
    const { buildVisibleGalleryItems } = await import('../../src/shared/utils/libraryGallerySelection.ts');
    const {
        createEmptyLibrarySelectionState,
        getLibrarySelectionAssetIds,
        updateLibrarySelection,
    } = await import('../../src/shared/utils/librarySelectionState.ts');
    const representative = buildAsset('representative', '2025-01-01T00:00:00.000Z');
    const unrelatedAsset = buildAsset('unrelated', '2025-01-02T00:00:00.000Z');
    const assets = [representative, unrelatedAsset];
    const presentationItems = [
        buildPresentationItem({
            key: 'exact:semantic-stack',
            representativeAssetId: 'representative',
            assetIds: ['representative', 'semantic-member-not-in-visible-page'],
            stackCount: 2,
            relationshipKind: 'exact_copy',
        }),
    ];
    const items = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: true,
        sortMode: 'date',
        presentationItems,
    });
    const selection = updateLibrarySelection(
        items,
        createEmptyLibrarySelectionState(),
        { mode: 'replace', index: 0 },
    );

    assert.deepEqual(
        new Set(getLibrarySelectionAssetIds(selection, assets)),
        new Set(['representative', 'semantic-member-not-in-visible-page']),
    );
    assert.deepEqual(selection.selectedItemsByKey.get('group:exact:semantic-stack'), {
        selectionKey: 'group:exact:semantic-stack',
        kind: 'presentation',
        representativeAssetId: 'representative',
        assetIds: ['representative', 'semantic-member-not-in-visible-page'],
    });
});

test('presentation declustering is a stable partition and does not re-sort server order', async () => {
    const { buildVisibleGalleryItems } = await import('../../src/shared/utils/libraryGallerySelection.ts');
    const assets = [
        buildAsset('first', '2024-01-01T00:00:00.000Z'),
        buildAsset('second', '2026-01-01T00:00:00.000Z'),
        buildAsset('third', '2025-01-01T00:00:00.000Z'),
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
        buildAsset('older', '2024-01-01T00:00:00.000Z'),
        buildAsset('newer', '2026-01-01T00:00:00.000Z'),
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
    assert.equal(items[0].asset.libraryPresentation, undefined);
});
