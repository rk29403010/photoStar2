const test = require('node:test');
const assert = require('node:assert/strict');

test('buildVisibleGalleryItems projects canonical groups in grouped mode and all photos in expanded mode', async () => {
    const { buildVisibleGalleryItems } = await import('../../dist/core/src/shared/utils/libraryGallerySelection.js');

    const assets = [
        { id: 'a1', original_path: 'C:/photos/a1.jpg', created_at: '2026-03-01T00:00:00.000Z', group_id: 'g1', group_role: 'canonical', stack_count: 3 },
        { id: 'a2', original_path: 'C:/photos/a2.jpg', created_at: '2026-03-02T00:00:00.000Z', group_id: 'g1', group_role: 'member', stack_count: 3 },
        { id: 'a3', original_path: 'C:/photos/a3.jpg', created_at: '2026-03-03T00:00:00.000Z' },
    ];

    const groupedItems = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: true,
        sortMode: 'date',
    });
    assert.deepEqual(groupedItems.map((item) => item.selectionKey), ['photo:a3', 'group:g1']);

    const expandedItems = buildVisibleGalleryItems(assets, {
        groupSimilarPhotos: false,
        sortMode: 'date',
    });
    assert.deepEqual(expandedItems.map((item) => item.selectionKey), ['photo:a3', 'photo:a2', 'photo:a1']);
});

test('updateLibrarySelection toggles and ranges over photo and group items independently', async () => {
    const {
        createEmptyLibrarySelectionState,
        updateLibrarySelection,
    } = await import('../../dist/core/src/shared/utils/librarySelectionState.js');

    const items = [
        { selectionKey: 'photo:a1', entityType: 'photo', photoId: 'a1', groupId: null, asset: { id: 'a1', original_path: 'a1.jpg' } },
        { selectionKey: 'group:g1', entityType: 'group', photoId: 'a2', groupId: 'g1', asset: { id: 'a2', original_path: 'a2.jpg' } },
        { selectionKey: 'photo:a3', entityType: 'photo', photoId: 'a3', groupId: null, asset: { id: 'a3', original_path: 'a3.jpg' } },
    ];

    const firstSelection = updateLibrarySelection(items, createEmptyLibrarySelectionState(), { mode: 'replace', index: 1 });
    assert.deepEqual([...firstSelection.groupIds], ['g1']);
    assert.equal(firstSelection.photoIds.size, 0);

    const rangedSelection = updateLibrarySelection(items, firstSelection, { mode: 'range', index: 2 });
    assert.deepEqual([...rangedSelection.groupIds], ['g1']);
    assert.deepEqual([...rangedSelection.photoIds], ['a3']);

    const toggledSelection = updateLibrarySelection(items, rangedSelection, { mode: 'toggle', index: 1 });
    assert.equal(toggledSelection.groupIds.size, 0);
    assert.deepEqual([...toggledSelection.photoIds], ['a3']);
});

test('getSelectionRangeKeys follows visible item order across rows', async () => {
    const { getSelectionRangeKeys } = await import('../../dist/core/src/shared/utils/librarySelectionState.js');

    assert.deepEqual(
        getSelectionRangeKeys(['photo:a1', 'photo:a2', 'group:g1', 'photo:a4'], 'photo:a1', 'group:g1'),
        ['photo:a1', 'photo:a2', 'group:g1'],
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
