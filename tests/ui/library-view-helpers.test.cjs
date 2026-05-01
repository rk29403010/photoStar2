const test = require('node:test');
const assert = require('node:assert/strict');

function buildItem(id, timestamp) {
    return {
        selectionKey: `photo:${id}`,
        entityType: 'photo',
        photoId: id,
        groupId: null,
        asset: {
            id,
            original_path: `${id}.jpg`,
            created_at: timestamp,
            photo_created_at: timestamp,
        },
    };
}

test('date timeline justified sections follow timeline group order even when display items are interleaved', async () => {
    const { buildDateTimelineJustifiedSections } = await import('../../src/ui/components/library/libraryTimelineSections.ts');

    const sections = buildDateTimelineJustifiedSections(
        [
            buildItem('one', '1974-06-01T00:00:00.000Z'),
            buildItem('two', '1971-01-01T00:00:00.000Z'),
            buildItem('three', '1947-03-05T00:00:00.000Z'),
            buildItem('four', '1913-08-21T00:00:00.000Z'),
            buildItem('five', '1977-09-10T00:00:00.000Z'),
            buildItem('six', '1932-04-12T00:00:00.000Z'),
        ],
        [
            { id: 'decade-1970', label: '1970s', sortKey: '1979-12-31T23:59:59.999Z', startDate: '1970-01-01T00:00:00.000Z', endDate: '1979-12-31T23:59:59.999Z', itemCount: 3, isLoaded: true },
            { id: 'decade-1940', label: '1940s', sortKey: '1949-12-31T23:59:59.999Z', startDate: '1940-01-01T00:00:00.000Z', endDate: '1949-12-31T23:59:59.999Z', itemCount: 1, isLoaded: true },
            { id: 'decade-1930', label: '1930s', sortKey: '1939-12-31T23:59:59.999Z', startDate: '1930-01-01T00:00:00.000Z', endDate: '1939-12-31T23:59:59.999Z', itemCount: 1, isLoaded: true },
            { id: 'decade-1910', label: '1910s', sortKey: '1919-12-31T23:59:59.999Z', startDate: '1910-01-01T00:00:00.000Z', endDate: '1919-12-31T23:59:59.999Z', itemCount: 1, isLoaded: true },
        ],
    );

    assert.deepEqual(
        sections.map((section) => section.id),
        ['decade-1970', 'decade-1940', 'decade-1930', 'decade-1910'],
    );
    assert.deepEqual(
        sections.map((section) => section.items.map((item) => item.asset.id)),
        [
            ['one', 'two', 'five'],
            ['three'],
            ['six'],
            ['four'],
        ],
    );
});

test('date timeline justified sections fall back to decade splits without timeline groups', async () => {
    const { buildDateTimelineJustifiedSections } = await import('../../src/ui/components/library/libraryTimelineSections.ts');

    const sections = buildDateTimelineJustifiedSections(
        [
            buildItem('one', '1982-06-01T00:00:00.000Z'),
            buildItem('two', '1974-06-01T00:00:00.000Z'),
        ],
        [],
    );

    assert.deepEqual(
        sections.map((section) => section.id),
        ['decade-1980', 'decade-1970'],
    );
});
