const test = require('node:test');
const assert = require('node:assert/strict');

const buckets = [
    { label: '1950s', startDate: '1950-01-01T00:00:00.000Z', endDate: '1959-12-31T23:59:59.999Z', count: 4 },
    { label: '1960s', startDate: '1960-01-01T00:00:00.000Z', endDate: '1969-12-31T23:59:59.999Z', count: 7 },
    { label: '1970s', startDate: '1970-01-01T00:00:00.000Z', endDate: '1979-12-31T23:59:59.999Z', count: 3 },
];

test('timeline rail renders newest decades first', async () => {
    const { getTimelineRailOrderedIndexes } = await import('../../src/ui/components/library/libraryTimelineRailModel.ts');

    assert.deepEqual(getTimelineRailOrderedIndexes(buckets.length), [2, 1, 0]);
});

test('timeline rail highlight follows the viewport decade before the active seek', async () => {
    const { getTimelineRailDisplayedIndex } = await import('../../src/ui/components/library/libraryTimelineRailModel.ts');

    assert.equal(getTimelineRailDisplayedIndex({
        viewportBucketIndex: 1,
        activeIndex: 2,
    }), 1);

    assert.equal(getTimelineRailDisplayedIndex({
        viewportBucketIndex: null,
        activeIndex: 2,
    }), -1);

    assert.equal(getTimelineRailDisplayedIndex({
        viewportBucketIndex: null,
        activeIndex: -1,
    }), -1);
});

test('visible timeline summary follows visible item order instead of hidden global decades', async () => {
    const { buildVisibleTimelineSummary } = await import('../../src/ui/components/library/libraryTimelineModel.ts');

    const items = [
        {
            selectionKey: 'photo:newest',
            entityType: 'photo',
            photoId: 'newest',
            groupId: null,
            asset: { id: 'newest', original_path: 'newest.jpg', photo_created_at: '2018-10-15T00:00:00.000Z' },
        },
        {
            selectionKey: 'photo:next',
            entityType: 'photo',
            photoId: 'next',
            groupId: null,
            asset: { id: 'next', original_path: 'next.jpg', photo_created_at: '2014-02-21T16:55:15.000Z' },
        },
        {
            selectionKey: 'photo:older',
            entityType: 'photo',
            photoId: 'older',
            groupId: null,
            asset: { id: 'older', original_path: 'older.jpg', photo_created_at: '2009-01-18T00:00:00.000Z' },
        },
        {
            selectionKey: 'photo:unknown',
            entityType: 'photo',
            photoId: 'unknown',
            groupId: null,
            asset: { id: 'unknown', original_path: 'unknown.jpg', photo_created_at: null },
        },
    ];

    const summary = buildVisibleTimelineSummary(items);
    assert.deepEqual(summary?.buckets.map((bucket) => bucket.label), ['2010s', '2000s']);
    assert.equal(summary?.unknownDateCount, 1);
    assert.equal(summary?.firstPhotoDate, '2009-01-18T00:00:00.000Z');
    assert.equal(summary?.lastPhotoDate, '2018-10-15T00:00:00.000Z');
});

test('gallery mode picks grouped and ungrouped timeline stats without using loaded tiles', async () => {
    const { getTimelineSummaryForGalleryMode } = await import('../../src/ui/components/library/libraryTimelineModel.ts');

    const groupedTimeline = { buckets: [{ label: '2010s', count: 2 }], datedPhotoCount: 2, unknownDateCount: 0, firstPhotoDate: '2014-01-01T00:00:00.000Z', lastPhotoDate: '2018-01-01T00:00:00.000Z' };
    const ungroupedTimeline = { buckets: [{ label: '2020s', count: 1 }, { label: '2010s', count: 7 }], datedPhotoCount: 8, unknownDateCount: 0, firstPhotoDate: '2014-01-01T00:00:00.000Z', lastPhotoDate: '2025-01-01T00:00:00.000Z' };

    assert.equal(getTimelineSummaryForGalleryMode({
        count: 8,
        timeline: groupedTimeline,
        groupedTimeline,
        ungroupedTimeline,
    }, true), groupedTimeline);

    assert.equal(getTimelineSummaryForGalleryMode({
        count: 8,
        timeline: groupedTimeline,
        groupedTimeline,
        ungroupedTimeline,
    }, false), ungroupedTimeline);
});
