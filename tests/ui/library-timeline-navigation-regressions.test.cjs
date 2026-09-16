const test = require('node:test');
const assert = require('node:assert/strict');

function buildItem(id, photoCreatedAt, createdAt = '2026-09-16T00:00:00.000Z') {
    return {
        selectionKey: `photo:${id}`,
        entityType: 'photo',
        photoId: id,
        groupId: null,
        asset: {
            id,
            original_path: `${id}.jpg`,
            photo_created_at: photoCreatedAt,
            created_at: createdAt,
        },
    };
}

test('timeline grouping treats import created_at as unknown when photo date is missing', async () => {
    const { buildGalleryTimeSections } = await import('../../src/ui/components/layout/galleryTimeSections.ts');

    const sections = buildGalleryTimeSections([
        buildItem('dated', '2024-06-01T00:00:00.000Z'),
        buildItem('unknown', null),
    ], 'decade');

    assert.deepEqual(
        sections.map((section) => ({ id: section.id, ids: section.items.map((item) => item.asset.id) })),
        [
            { id: 'decade-2020', ids: ['dated'] },
            { id: 'unknown-date', ids: ['unknown'] },
        ],
    );
});

test('date timeline sections use requested sort direction and keep unknown last', async () => {
    const { buildDateTimelineJustifiedSections } = await import('../../src/ui/components/library/libraryTimelineSections.ts');
    const items = [
        buildItem('old', '1895-04-12T00:00:00.000Z'),
        buildItem('new', '2024-06-01T00:00:00.000Z'),
        buildItem('unknown', null),
    ];

    assert.deepEqual(
        buildDateTimelineJustifiedSections(items, [], 'date').map((section) => section.id),
        ['decade-2020', 'decade-1890', 'unknown-date'],
    );
    assert.deepEqual(
        buildDateTimelineJustifiedSections(items, [], 'reverse-date').map((section) => section.id),
        ['decade-1890', 'decade-2020', 'unknown-date'],
    );
});

test('unknown timeline seek targets the unknown section instead of filtering the gallery', async () => {
    const { getTimelineSectionIdForSeek } = await import('../../src/ui/components/library/libraryTimelineJump.ts');

    assert.equal(getTimelineSectionIdForSeek({ kind: 'unknown' }), 'unknown-date');
    assert.equal(
        getTimelineSectionIdForSeek({ kind: 'dated', targetDate: '1895-04-12T00:00:00.000Z' }),
        'decade-1890',
    );
});
