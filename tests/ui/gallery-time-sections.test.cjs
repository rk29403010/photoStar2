const test = require('node:test');
const assert = require('node:assert/strict');

function buildItem(id, photoCreatedAt) {
    return {
        selectionKey: `photo:${id}`,
        entityType: 'photo',
        photoId: id,
        groupId: null,
        asset: {
            id,
            original_path: `${id}.jpg`,
            photo_created_at: photoCreatedAt,
        },
    };
}

test('gallery time sections group dated assets into non-empty decade blocks', async () => {
    const { buildGalleryTimeSections } = await import('../../src/ui/components/layout/galleryTimeSections.ts');

    const sections = buildGalleryTimeSections([
        buildItem('a', '1962-01-03T00:00:00.000Z'),
        buildItem('b', '1968-05-09T00:00:00.000Z'),
        buildItem('c', '1971-07-10T00:00:00.000Z'),
    ], 'decade');

    assert.deepEqual(
        sections.map((section) => ({ id: section.id, label: section.label, ids: section.items.map((item) => item.asset.id) })),
        [
            { id: 'decade-1960', label: '1960s', ids: ['a', 'b'] },
            { id: 'decade-1970', label: '1970s', ids: ['c'] },
        ],
    );
});

test('gallery time sections keep unknown dates in an unlabeled trailing section', async () => {
    const { buildGalleryTimeSections } = await import('../../src/ui/components/layout/galleryTimeSections.ts');

    const sections = buildGalleryTimeSections([
        buildItem('a', '1962-01-03T00:00:00.000Z'),
        buildItem('b', null),
        buildItem('c', null),
    ], 'decade');

    assert.deepEqual(
        sections.map((section) => ({ label: section.label, ids: section.items.map((item) => item.asset.id) })),
        [
            { label: '1960s', ids: ['a'] },
            { label: null, ids: ['b', 'c'] },
        ],
    );
});
