import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readGalleryTimelineSources() {
    return {
        libraryViewSource: fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8'),
        toolbarSource: fs.readFileSync('src/ui/components/library/LibraryToolbar.tsx', 'utf8'),
        timelineRailSource: fs.readFileSync('src/ui/components/library/LibraryTimelineRail.tsx', 'utf8'),
        timelineHelpersSource: fs.readFileSync('src/ui/components/library/libraryViewTimeline.tsx', 'utf8'),
        timelineModelSource: fs.readFileSync('src/ui/components/library/libraryTimelineModel.ts', 'utf8'),
        timelinePresentationSource: fs.readFileSync('src/ui/components/library/libraryViewPresentation.tsx', 'utf8'),
        timelineScrollResetSource: fs.readFileSync('src/ui/components/library/libraryTimelineSeekScrollReset.ts', 'utf8'),
        timelineJumpSource: fs.readFileSync('src/ui/components/library/libraryTimelineJump.ts', 'utf8'),
        visibleSelectionSource: fs.readFileSync('src/ui/components/library/libraryVisibleSelectionKey.ts', 'utf8'),
        appMainContentSource: fs.readFileSync('src/ui/components/app/AppMainContent.tsx', 'utf8'),
        loadedAppShellSource: fs.readFileSync('src/ui/components/app/LoadedAppShell.tsx', 'utf8'),
        layoutEngineSource: fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8'),
        layoutModeRendererSource: fs.readFileSync('src/ui/components/layout/LayoutModeRenderer.tsx', 'utf8'),
        justifiedLayoutSource: fs.readFileSync('src/ui/components/layout/JustifiedLayout.tsx', 'utf8'),
        groupedTimelineLayoutSource: fs.readFileSync('src/ui/components/layout/GroupedTimelineLayout.tsx', 'utf8'),
        coreActionsSource: fs.readFileSync('src/ui/hooks/usePhotoLibrary.coreActions.ts', 'utf8'),
        photoLibrarySource: fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8'),
        connectionMessagesSource: fs.readFileSync('src/boundary/runtime/usePhotoLibrary.connection.messages.ts', 'utf8'),
    };
}

function assertTimelineWiringCore(sources) {
    const { libraryViewSource, toolbarSource, timelineHelpersSource, timelineModelSource, timelinePresentationSource } = sources;

    assert.match(libraryViewSource, /stats: LibraryStats \| null;/);
    assert.match(libraryViewSource, /galleryTimelineSeek: GalleryTimelineSeek \| null;/);
    assert.match(libraryViewSource, /isSeekingTimeline: boolean;/);
    assert.match(libraryViewSource, /onGalleryTimelineSeek: \(seek: GalleryTimelineSeek \| null\) => void;/);
    assert.doesNotMatch(toolbarSource, /LibraryTimelineRail/);
    assert.match(libraryViewSource, /timelineRail,/);
    assert.match(timelineHelpersSource, /<LibraryTimelineRail/);
    assert.match(timelineModelSource, /getTimelineSummaryForGalleryMode/);
    assert.match(timelinePresentationSource, /getTimelineSummaryForGalleryMode/);
    assert.match(timelinePresentationSource, /stats: LibraryStats \| null;/);
    assert.match(timelinePresentationSource, /viewportBucketIndex/);
    assert.match(libraryViewSource, /setTopVisibleSelectionKey/);
    assert.match(libraryViewSource, /useLibraryPresentationModel/);
    assert.match(libraryViewSource, /useDateTimelineJumpModel/);
    assert.match(libraryViewSource, /handleTimelineJump,/);
    assert.match(libraryViewSource, /function useLatestRef/);
    assert.match(libraryViewSource, /const onGalleryOrderChangeRef = useLatestRef\(onGalleryOrderChange\)/);
    assert.match(libraryViewSource, /const onGalleryTimelineSeekRef = useLatestRef\(onGalleryTimelineSeek\)/);
    assert.doesNotMatch(libraryViewSource, /scrollTo\(\{ top: 0, behavior: 'auto' \}\);\n {4}}, \[effectiveSortMode, onGalleryOrderChange, onGalleryTimelineSeek, scrollRef\]/);
    assert.match(fs.readFileSync('src/ui/components/library/libraryViewTimelineSync.ts', 'utf8'), /syncViewportBucketIndexFromScrollContainer/);
    assert.match(fs.readFileSync('src/ui/components/library/libraryViewTimelineSync.ts', 'utf8'), /syncViewportBucketIndexFromScrollContainer\(event\.currentTarget\)/);
    assert.match(fs.readFileSync('src/ui/components/library/libraryViewTimelineSync.ts', 'utf8'), /const nextSelectionKey = getTopVisibleSelectionKeyFromScrollContainer\(event\.currentTarget\);/);
    assert.match(fs.readFileSync('src/ui/components/library/libraryViewTimelineSync.ts', 'utf8'), /setTopVisibleSelectionKey\(nextSelectionKey\)/);
}

function assertTimelineRailAndJumpWiring(sources) {
    const { libraryViewSource, timelineScrollResetSource, visibleSelectionSource, timelineHelpersSource, timelineRailSource, timelineJumpSource } = sources;

    assert.match(libraryViewSource, /useTimelineSeekScrollReset\(scrollRef, props\.galleryTimelineSeek, props\.isSeekingTimeline\)/);
    assert.match(timelineScrollResetSource, /scrollRef\.current\?\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/);
    assert.match(visibleSelectionSource, /getTopVisibleDataAttributeValueFromScrollContainer/);
    assert.match(visibleSelectionSource, /querySelectorAll<HTMLElement>\(selector\)/);
    assert.match(visibleSelectionSource, /'\[data-selection-key\]'/);
    assert.match(timelineHelpersSource, /visibleSelectionKey: string \| null;/);
    assert.doesNotMatch(timelineHelpersSource, /querySelectorAll<HTMLElement>\('\[data-selection-key\]'\)/);
    assert.match(timelineHelpersSource, /const selectionBucketIndex = findViewportTimelineBucketIndex\(params\.visibleSelectionKey, selectionKeyToBucketIndex\);/);
    assert.match(timelineHelpersSource, /const viewportBucketIndex = selectionBucketIndex;/);
    assert.match(timelineHelpersSource, /if \(typeof params\.visibleTimelineGroupIndex === 'number'\) \{/);
    assert.doesNotMatch(timelineRailSource, /type="range"/);
    assert.match(timelineRailSource, /TimelineRailBucketButton/);
    assert.match(timelineRailSource, /onClick=\{\(\) =>/);
    assert.doesNotMatch(timelineRailSource, /setPointerCapture/);
    assert.doesNotMatch(timelineRailSource, /onPointerDown/);
    assert.doesNotMatch(timelineRailSource, /onPointerMove/);
    assert.doesNotMatch(timelineRailSource, /onPointerUp/);
    assert.doesNotMatch(timelineRailSource, /setInterval|window\.setInterval/);
    assert.doesNotMatch(timelineRailSource, /data-timeline-rail-track/);
    assert.doesNotMatch(timelineRailSource, /getTimelineRailBucketIndexFromPointer/);
    assert.doesNotMatch(timelineRailSource, /key=.*vp=.*shown=/);
    assert.doesNotMatch(timelineRailSource, /Oldest /);
    assert.doesNotMatch(timelineRailSource, /Newest /);
    assert.match(timelineRailSource, /Unknown/);
    assert.match(timelineJumpSource, /getTimelineSectionIdForSeek/);
    assert.match(timelineJumpSource, /loadedGroupIdsRef\.current\.has\(groupId\)/);
    assert.match(timelineJumpSource, /requestTimelineJump\(groupId, groupIndex\)/);
    assert.match(timelineJumpSource, /onGalleryTimelineSeek\(fallbackSeek\);/);
    assert.doesNotMatch(timelineJumpSource, /waitForTimelineGroupPagingToSettle/);
    assert.match(timelineJumpSource, /loadedGroupIdsRef\.current\.has\(groupId\)/);
    assert.match(timelineJumpSource, /timelineJumpRequest/);
    assert.doesNotMatch(timelineJumpSource, /onLoadMoreAssetsRef/);
    assert.match(timelineJumpSource, /onGalleryTimelineSeek\(fallbackSeek\)/);
}

function assertTimelineLayoutWiring(sources) {
    const { appMainContentSource, loadedAppShellSource, coreActionsSource, photoLibrarySource, connectionMessagesSource, layoutEngineSource, layoutModeRendererSource, groupedTimelineLayoutSource, justifiedLayoutSource } = sources;

    assert.match(appMainContentSource, /stats=\{props\.stats\}/);
    assert.match(appMainContentSource, /galleryTimelineSeek=\{props\.galleryTimelineSeek\}/);
    assert.match(appMainContentSource, /isSeekingTimeline=\{props\.isSeekingTimeline\}/);
    assert.match(loadedAppShellSource, /stats,/);
    assert.match(loadedAppShellSource, /galleryTimelineSeek,/);
    assert.match(loadedAppShellSource, /isSeekingTimeline,/);
    assert.match(loadedAppShellSource, /onGalleryTimelineSeek=\{actions\.seekGalleryTimeline\}/);
    assert.match(coreActionsSource, /if \(groupSimilarPhotosRef\.current === enabled\) \{return;\}/);
    assert.match(coreActionsSource, /setIsSeekingTimeline\(true\)/);
    assert.doesNotMatch(coreActionsSource, /seekGalleryTimeline[\s\S]*setAssets\(\[\]\)/);
    assert.match(photoLibrarySource, /setIsSeekingTimeline: state\.setIsSeekingTimeline/);
    assert.match(connectionMessagesSource, /params\.setIsSeekingTimeline\(false\)/);
    assert.match(connectionMessagesSource, /else if \(isPreservedPagingAssetRefreshId\(msg\.id\)\)/);
    assert.match(connectionMessagesSource, /return assets;/);
    assert.match(layoutEngineSource, /data-selection-key=\{layoutItem\.item\.selectionKey\}/);
    assert.match(layoutModeRendererSource, /<GroupedTimelineLayout/);
    assert.match(groupedTimelineLayoutSource, /data-time-section-id=\{group\.id\}/);
    assert.doesNotMatch(justifiedLayoutSource, /data-time-section-id=/);
    assert.match(justifiedLayoutSource, /const \[customScrollParent, setCustomScrollParent\] = useState<HTMLDivElement \| undefined>\(\)/);
    assert.match(justifiedLayoutSource, /const nextScrollParent = scrollContainerRef\?\.current \?\? undefined/);
    assert.match(justifiedLayoutSource, /(window|globalThis)\.requestAnimationFrame\(syncScrollParent\)/);
    assert.match(justifiedLayoutSource, /const customScrollParent = useCustomScrollParent\(props\.scrollContainerRef\)/);
    assert.match(justifiedLayoutSource, /if \(props\.scrollContainerRef && !customScrollParent\)/);
}

test('gallery exposes a global timeline rail with decade jump buttons and stable tile selection keys', () => {
    const sources = readGalleryTimelineSources();

    assertTimelineWiringCore(sources);
    assertTimelineRailAndJumpWiring(sources);
    assertTimelineLayoutWiring(sources);
});

test('available tag loading is gated by active state instead of callback identity churn', () => {
    const availableTagsSource = fs.readFileSync('src/ui/hooks/useAvailableTags.ts', 'utf8');

    assert.match(availableTagsSource, /const loadAvailableTagsRef = useRef\(loadAvailableTags\)/);
    assert.match(availableTagsSource, /loadAvailableTagsRef\.current\(\)/);
    assert.doesNotMatch(availableTagsSource, /\[enabled, loadAvailableTags\]/);
});
