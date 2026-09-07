const test = require('node:test');
const assert = require('node:assert/strict');

function presentationItem({ key, representativeAssetId, assetIds, relationshipKind = 'exact_copy' }) {
    return {
        presentationKey: key,
        representativeAssetId,
        relationshipKind,
        stackCount: assetIds.length,
        assetIds,
        originalPath: `C:/photos/${representativeAssetId}.jpg`,
        photoCreatedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        previewPath: null,
    };
}

test('buildVisibleGalleryItems uses server presentation stacks in grouped mode and all photos in expanded mode', async () => {
    const { buildVisibleGalleryItems } = await import('../../dist/core/src/shared/utils/libraryGallerySelection.js');

    const assets = [
        { id: 'a1', original_path: 'C:/photos/a1.jpg', created_at: '2026-03-01T00:00:00.000Z' },
        { id: 'a2', original_path: 'C:/photos/a2.jpg', created_at: '2026-03-02T00:00:00.000Z' },
        { id: 'a3', original_path: 'C:/photos/a3.jpg', created_at: '2026-03-03T00:00:00.000Z' },
    ];
    const presentationItems = [
        presentationItem({ key: 'asset:a3', representativeAssetId: 'a3', assetIds: ['a3'], relationshipKind: null }),
        presentationItem({ key: 'exact:stack-1', representativeAssetId: 'a1', assetIds: ['a1', 'a2'] }),
    ];

    const groupedItems = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: true,
        sortMode: 'date',
        presentationItems,
    });
    assert.deepEqual(groupedItems.map((item) => item.selectionKey), ['photo:a3', 'group:exact:stack-1']);

    const expandedItems = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: false,
        sortMode: 'date',
        presentationItems,
    });
    assert.deepEqual(expandedItems.map((item) => item.selectionKey), ['photo:a3', 'photo:a2', 'photo:a1']);
});

test('buildVisibleGalleryItems keeps one selectable item per server-side presentation item', async () => {
    const { buildVisibleGalleryItems } = await import('../../dist/core/src/shared/utils/libraryGallerySelection.js');

    const assets = [
        { id: 'a1', original_path: 'C:/photos/a1.jpg', created_at: '2026-03-04T00:00:00.000Z' },
        { id: 'a2', original_path: 'C:/photos/a2.jpg', created_at: '2026-03-03T00:00:00.000Z' },
        { id: 'a3', original_path: 'C:/photos/a3.jpg', created_at: '2026-03-02T00:00:00.000Z' },
        { id: 'a4', original_path: 'C:/photos/a4.jpg', created_at: '2026-03-01T00:00:00.000Z' },
    ];
    const presentationItems = [
        presentationItem({ key: 'exact:stack-1', representativeAssetId: 'a1', assetIds: ['a1', 'a2'] }),
        presentationItem({ key: 'variant:stack-2', representativeAssetId: 'a3', assetIds: ['a3', 'hidden-a5'], relationshipKind: 'variant' }),
        presentationItem({ key: 'asset:a4', representativeAssetId: 'a4', assetIds: ['a4'], relationshipKind: null }),
    ];

    const groupedItems = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: true,
        sortMode: 'date',
        presentationItems,
    });

    assert.deepEqual(
        groupedItems.map((item) => item.selectionKey),
        ['group:exact:stack-1', 'group:variant:stack-2', 'photo:a4'],
    );
    assert.deepEqual(groupedItems.map((item) => item.asset.id), ['a1', 'a3', 'a4']);
    assert.deepEqual(groupedItems[1].presentation.assetIds, ['a3', 'hidden-a5']);
});

test('updateLibrarySelection toggles and ranges over photo and presentation-stack items independently', async () => {
    const {
        createEmptyLibrarySelectionState,
        updateLibrarySelection,
    } = await import('../../dist/core/src/shared/utils/librarySelectionState.js');

    const items = [
        { selectionKey: 'photo:a1', entityType: 'photo', photoId: 'a1', groupId: null, asset: { id: 'a1', original_path: 'a1.jpg' } },
        { selectionKey: 'group:exact:stack-1', entityType: 'group', photoId: 'a2', groupId: 'exact:stack-1', asset: { id: 'a2', original_path: 'a2.jpg' } },
        { selectionKey: 'photo:a3', entityType: 'photo', photoId: 'a3', groupId: null, asset: { id: 'a3', original_path: 'a3.jpg' } },
    ];

    const firstSelection = updateLibrarySelection(items, createEmptyLibrarySelectionState(), { mode: 'replace', index: 1 });
    assert.deepEqual([...firstSelection.groupIds], ['exact:stack-1']);
    assert.equal(firstSelection.photoIds.size, 0);

    const rangedSelection = updateLibrarySelection(items, firstSelection, { mode: 'range', index: 2 });
    assert.deepEqual([...rangedSelection.groupIds], ['exact:stack-1']);
    assert.deepEqual([...rangedSelection.photoIds], ['a3']);

    const toggledSelection = updateLibrarySelection(items, rangedSelection, { mode: 'toggle', index: 1 });
    assert.equal(toggledSelection.groupIds.size, 0);
    assert.deepEqual([...toggledSelection.photoIds], ['a3']);
});

test('getSelectionRangeKeys follows visible item order across rows', async () => {
    const { getSelectionRangeKeys } = await import('../../dist/core/src/shared/utils/librarySelectionState.js');

    assert.deepEqual(
        getSelectionRangeKeys(['photo:a1', 'photo:a2', 'group:exact:stack-1', 'photo:a4'], 'photo:a1', 'group:exact:stack-1'),
        ['photo:a1', 'photo:a2', 'group:exact:stack-1'],
    );
});

test('library selection visuals use the blue frame and star color', async () => {
    const {
        LIBRARY_SELECTION_FRAME_COLOR,
        LIBRARY_SELECTION_STAR_COLOR,
    } = await import('../../dist/core/src/shared/utils/librarySelectionVisuals.js');

    assert.equal(LIBRARY_SELECTION_FRAME_COLOR, '#60a5fa');
    assert.equal(LIBRARY_SELECTION_STAR_COLOR, '#60a5fa');
});
