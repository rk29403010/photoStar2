const test = require('node:test');
const assert = require('node:assert/strict');

function selectedPhoto(selectionKey, assetId) {
    return {
        selectionKey,
        kind: 'photo',
        representativeAssetId: assetId,
        assetIds: [assetId],
    };
}

function selectedPresentation(selectionKey, representativeAssetId, assetIds) {
    return {
        selectionKey,
        kind: 'presentation',
        representativeAssetId,
        assetIds,
    };
}

function createSelection({ selectedItems = [], anchorKey = null, mostRecentSelectionKey = null } = {}) {
    return {
        selectedItemsByKey: new Map(selectedItems.map((item) => [item.selectionKey, item])),
        anchorKey,
        mostRecentSelectionKey,
    };
}

test('getGalleryInfoPanelAsset returns the most recently selected photo asset', async () => {
    const { getGalleryInfoPanelAsset } = await import('../../src/ui/components/library/galleryInfoPanelModel.ts');

    const items = [
        { selectionKey: 'photo:a1', entityType: 'photo', photoId: 'a1', groupId: null, asset: { id: 'a1', original_path: 'a1.jpg' } },
        { selectionKey: 'photo:a2', entityType: 'photo', photoId: 'a2', groupId: null, asset: { id: 'a2', original_path: 'a2.jpg' } },
        { selectionKey: 'photo:a3', entityType: 'photo', photoId: 'a3', groupId: null, asset: { id: 'a3', original_path: 'a3.jpg' } },
    ];
    const selection = createSelection({
        selectedItems: [selectedPhoto('photo:a1', 'a1'), selectedPhoto('photo:a3', 'a3')],
        anchorKey: 'photo:a1',
        mostRecentSelectionKey: 'photo:a3',
    });

    assert.equal(getGalleryInfoPanelAsset(items, selection)?.id, 'a3');
});

test('getGalleryInfoPanelAsset falls back to the remaining selected asset when the last toggled item was deselected', async () => {
    const { getGalleryInfoPanelAsset } = await import('../../src/ui/components/library/galleryInfoPanelModel.ts');

    const items = [
        { selectionKey: 'photo:a1', entityType: 'photo', photoId: 'a1', groupId: null, asset: { id: 'a1', original_path: 'a1.jpg' } },
        { selectionKey: 'photo:a2', entityType: 'photo', photoId: 'a2', groupId: null, asset: { id: 'a2', original_path: 'a2.jpg' } },
    ];
    const selection = createSelection({
        selectedItems: [selectedPhoto('photo:a1', 'a1')],
        anchorKey: 'photo:a1',
        mostRecentSelectionKey: 'photo:a2',
    });

    assert.equal(getGalleryInfoPanelAsset(items, selection)?.id, 'a1');
});

test('getGalleryInfoPanelAsset resolves stacked selections to the visible representative', async () => {
    const { getGalleryInfoPanelAsset } = await import('../../src/ui/components/library/galleryInfoPanelModel.ts');

    const items = [
        { selectionKey: 'group:g1', entityType: 'group', photoId: 'a1', groupId: 'g1', asset: { id: 'a1', original_path: 'a1.jpg' } },
        { selectionKey: 'photo:a2', entityType: 'photo', photoId: 'a2', groupId: null, asset: { id: 'a2', original_path: 'a2.jpg' } },
    ];
    const selection = createSelection({
        selectedItems: [selectedPresentation('group:g1', 'a1', ['a1'])],
        anchorKey: 'group:g1',
        mostRecentSelectionKey: 'group:g1',
    });

    assert.equal(getGalleryInfoPanelAsset(items, selection)?.id, 'a1');
});

test('getGalleryInfoPanelAsset preserves semantic presentation context for a stacked item', async () => {
    const { getGalleryInfoPanelAsset } = await import('../../src/ui/components/library/galleryInfoPanelModel.ts');
    const presentation = {
        presentationKey: 'exact:stack-1',
        representativeAssetId: 'a1',
        relationshipKind: 'exact_copy',
        stackCount: 2,
        assetIds: ['a1', 'a2'],
        momentCount: 1,
    };
    const items = [{
        selectionKey: 'group:exact:stack-1',
        entityType: 'group',
        photoId: 'a1',
        groupId: 'exact:stack-1',
        asset: { id: 'a1', original_path: 'a1.jpg' },
        presentation,
    }];
    const selection = createSelection({
        selectedItems: [selectedPresentation('group:exact:stack-1', 'a1', ['a1', 'a2'])],
        anchorKey: 'group:exact:stack-1',
        mostRecentSelectionKey: 'group:exact:stack-1',
    });

    const result = getGalleryInfoPanelAsset(items, selection);
    assert.equal(result?.id, 'a1');
    assert.deepEqual(result?.libraryPresentation, presentation);
    assert.equal(result?.group_id, undefined, 'semantic context must not be rewritten into legacy group fields');
});
