import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('timeline jump and viewport highlight use grouped timeline state instead of flat section indexes', () => {
    const timelineJumpSource = fs.readFileSync('src/ui/components/library/libraryTimelineJump.ts', 'utf8');
    const timelinePresentationSource = fs.readFileSync('src/ui/components/library/libraryViewPresentation.tsx', 'utf8');
    const timelineHelpersSource = fs.readFileSync('src/ui/components/library/libraryViewHelpers.tsx', 'utf8');
    const timelineSyncSource = fs.readFileSync('src/ui/components/library/libraryViewTimelineSync.ts', 'utf8');
    const timelineViewSource = fs.readFileSync('src/ui/components/library/libraryViewTimeline.tsx', 'utf8');
    const groupedTimelineLayoutSource = fs.readFileSync('src/ui/components/layout/GroupedTimelineLayout.tsx', 'utf8');
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');

    assert.match(timelineJumpSource, /onLoadTimelineGroupPage\?: \(groupId: string\) => void;/);
    assert.match(timelineJumpSource, /onRequestTimelineJumpTarget\?: \(groupId: string\) => void;/);
    assert.match(timelineJumpSource, /if \(groupIndex != null\) \{/);
    assert.match(timelineJumpSource, /if \(loadedGroupIdsRef\.current\.has\(groupId\)\) \{/);
    assert.match(timelineJumpSource, /if \(onLoadTimelineGroupPage\) \{/);
    assert.match(timelineJumpSource, /if \(!loadingByGroupId\[groupId\]\) \{/);
    assert.match(timelineJumpSource, /onLoadTimelineGroupPage\(groupId\);/);
    assert.match(timelineJumpSource, /requestTimelineJump\(groupId, groupIndex\);/);
    assert.match(timelineJumpSource, /onGalleryTimelineSeek\(fallbackSeek\);/);
    assert.doesNotMatch(timelineJumpSource, /waitForTimelineGroupPagingToSettle/);
    assert.doesNotMatch(timelineJumpSource, /onLoadMoreAssetsRef/);

    assert.match(timelineHelpersSource, /onLoadTimelineGroupPage\?: \(groupId: string\) => void;/);
    assert.match(timelineHelpersSource, /onRequestTimelineJumpTarget\?: \(groupId: string\) => void;/);
    assert.match(timelineHelpersSource, /loadedGroupIds: loadedTimelineGroupIds,/);

    assert.match(timelinePresentationSource, /timelineVisibleGroupIndex: number \| null;/);
    assert.match(timelineHelpersSource, /timelineVisibleGroupIndex: params\.timelineVisibleGroupIndex,/);
    assert.match(timelineSyncSource, /visibleTimelineGroupIndex: number \| null;/);
    assert.match(timelineViewSource, /visibleTimelineGroupId: TimelineGroupId \| null;/);
    assert.match(timelineViewSource, /getTimelineGroupIdForBucketStartYear\(bucket\.startYear\) === visibleTimelineGroupId/);
    assert.match(timelineViewSource, /if \(typeof params\.visibleTimelineGroupIndex === 'number'\) \{/);
    assert.match(timelineViewSource, /viewportBucketIndex: null,/);

    assert.match(groupedTimelineLayoutSource, /onVisibleGroupChange\?: \(groupId: string \| null, groupIndex: number \| null\) => void;/);
    assert.match(groupedTimelineLayoutSource, /if \(!group \|\| group\.rows\.length <= 0\) \{/);
    assert.match(groupedTimelineLayoutSource, /containerRef\.current\?\.querySelector<HTMLElement>\(`/);
    assert.match(groupedTimelineLayoutSource, /customScrollParent\.scrollTo\(\{ top: nextTop, behavior: 'auto' \}\)/);
    assert.match(groupedTimelineLayoutSource, /targetHeader\.scrollIntoView\(\{ block: 'start', behavior: 'auto' \}\)/);
    assert.match(groupedTimelineLayoutSource, /syncVisibleStateFromDom\(/);
    assert.match(groupedTimelineLayoutSource, /getTopVisibleTimelineGroupIdFromScrollContainer/);
    assert.match(groupedTimelineLayoutSource, /getTopVisibleSelectionKeyFromScrollContainer/);
    assert.match(groupedTimelineLayoutSource, /function useInitialTimelineVisibleState\(/);
    assert.match(groupedTimelineLayoutSource, /function useTimelineVisibleStateOnScroll\(/);
    assert.match(groupedTimelineLayoutSource, /customScrollParent\.addEventListener\('scroll', scheduleVisibleStateSync, \{ passive: true \}\)/);
    assert.match(groupedTimelineLayoutSource, /data-time-section-id=\{group\.id\}/);
    assert.match(groupedTimelineLayoutSource, /rowsByGroup\[groupIndex\]\?\.map\(\(row\) => renderTimelineRow\(row, props\)\)/);

    assert.match(libraryViewSource, /onLoadTimelineGroupPage\?: \(groupId: string\) => void;/);
    assert.match(libraryViewSource, /onRequestTimelineJumpTarget\?: \(groupId: string\) => void;/);
    assert.match(libraryViewSource, /onTimelineVisibleGroupChange\?: \(groupId: string \| null, groupIndex: number \| null\) => void;/);
});
