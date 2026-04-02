const test = require('node:test');
const assert = require('node:assert/strict');

function createSelection(overrides = {}) {
    return {
        photoIds: new Set(),
        groupIds: new Set(),
        anchorKey: null,
        mostRecentSelectionKey: null,
        ...overrides,
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
        photoIds: new Set(['a1', 'a3']),
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
        photoIds: new Set(['a1']),
        anchorKey: 'photo:a1',
        mostRecentSelectionKey: 'photo:a2',
    });

    assert.equal(getGalleryInfoPanelAsset(items, selection)?.id, 'a1');
});

test('getGalleryInfoPanelAsset resolves grouped selections to the visible group representative', async () => {
    const { getGalleryInfoPanelAsset } = await import('../../src/ui/components/library/galleryInfoPanelModel.ts');

    const items = [
        { selectionKey: 'group:g1', entityType: 'group', photoId: 'a1', groupId: 'g1', asset: { id: 'a1', original_path: 'a1.jpg', group_id: 'g1' } },
        { selectionKey: 'photo:a2', entityType: 'photo', photoId: 'a2', groupId: null, asset: { id: 'a2', original_path: 'a2.jpg' } },
    ];
    const selection = createSelection({
        groupIds: new Set(['g1']),
        anchorKey: 'group:g1',
        mostRecentSelectionKey: 'group:g1',
    });

    assert.equal(getGalleryInfoPanelAsset(items, selection)?.id, 'a1');
});
