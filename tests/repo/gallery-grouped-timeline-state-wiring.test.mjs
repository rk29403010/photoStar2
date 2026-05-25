import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('date-mode wiring reads grouped timeline state from a dedicated slice', () => {
    const timelineStateSource = fs.readFileSync('src/ui/hooks/useTimelineGalleryState.ts', 'utf8');
    const stateSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.state.ts', 'utf8');
    const connectionSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.connection.ts', 'utf8');
    const hookSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8');
    const compositionSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.composition.ts', 'utf8');
    const messageSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.connection.messages.ts', 'utf8');
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');
    const helperSource = fs.readFileSync('src/ui/components/library/libraryViewHelpers.tsx', 'utf8');
    const panelContentSource = fs.readFileSync('src/ui/components/library/LibraryPanelContent.tsx', 'utf8');
    const galleryPaneSource = fs.readFileSync('src/ui/components/library/LibraryGalleryPane.tsx', 'utf8');
    const layoutEngineSource = fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8');
    const timelineJumpSource = fs.readFileSync('src/ui/components/library/libraryTimelineJump.ts', 'utf8');
    const justifiedLayoutSource = fs.readFileSync('src/ui/components/layout/JustifiedLayout.tsx', 'utf8');
    const groupedTimelineLayoutSource = fs.readFileSync('src/ui/components/layout/GroupedTimelineLayout.tsx', 'utf8');

    assert.match(timelineStateSource, /export (interface|type) TimelineGalleryStateSlice/);
    assert.match(timelineStateSource, /groupSummaries: TimelineGroupSummary\[\];/);
    assert.match(timelineStateSource, /loadedPagesByGroupId: Partial<Record<TimelineGroupId, TimelineGalleryPage>>;/);
    assert.match(timelineStateSource, /loadingByGroupId: Partial<Record<TimelineGroupId, boolean>>;/);
    assert.match(timelineStateSource, /activeJumpTarget: TimelineJumpTarget \| null;/);
    assert.match(timelineStateSource, /visibleGroupId: TimelineGroupId \| null;/);
    assert.match(timelineStateSource, /visibleGroupIndex: number \| null;/);
    assert.match(timelineStateSource, /export function useTimelineGalleryState\(\)/);

    assert.match(stateSource, /import \{ useTimelineGalleryState \} from '\.\/useTimelineGalleryState';/);
    assert.match(stateSource, /const galleryDataModeRef = useRef<LibraryGalleryDataMode>\('grouped-timeline'\);/);
    assert.match(stateSource, /const timelineGalleryState = useTimelineGalleryState\(\);/);
    assert.match(stateSource, /\.\.\.timelineGalleryState,/);

    assert.match(connectionSource, /GROUPED_TIMELINE_ASSET_LIMIT/);
    assert.match(connectionSource, /const initialAssetLimit = includeTimelineGroups \? GROUPED_TIMELINE_ASSET_LIMIT : ASSET_PAGE_SIZE;/);
    assert.match(connectionSource, /id: 'assets-init', command: 'get_assets', payload: \{ limit: initialAssetLimit,/);

    assert.match(compositionSource, /timelineGallery: state\.timelineGallery,/);
    assert.match(compositionSource, /setTimelineGroupSummaries: state\.setTimelineGroupSummaries,/);
    assert.match(compositionSource, /upsertTimelineGroupPage: state\.upsertTimelineGroupPage,/);
    assert.match(compositionSource, /setTimelineActiveJumpTarget: state\.setTimelineActiveJumpTarget,/);

    assert.match(messageSource, /params\.setTimelineGroupSummaries\(/);
    assert.match(messageSource, /params\.upsertTimelineGroupPage\(/);
    assert.match(messageSource, /params\.setTimelineActiveJumpTarget\(/);

    assert.match(hookSource, /resetTimelineGallery: state\.resetTimelineGallery,/);
    assert.match(hookSource, /setTimelineGroupLoading: state\.setTimelineGroupLoading,/);
    assert.match(hookSource, /setTimelineActiveJumpTarget: state\.setTimelineActiveJumpTarget,/);

    assert.match(libraryViewSource, /timelineGallery: TimelineGalleryStateSlice;/);
    assert.match(libraryViewSource, /useDateTimelineJumpModel\(\{/);
    assert.match(libraryViewSource, /useDateTimelineJustifiedSections\(\{/);
    assert.match(libraryViewSource, /justifiedSections,/);
    assert.match(libraryViewSource, /timelineGallery: props\.timelineGallery,/);
    assert.doesNotMatch(libraryViewSource, /useLoadedTimelineSectionIds\(displayItems, timeSectionMode\)/);

    assert.match(helperSource, /export function useLoadedTimelineGroupIds\(/);
    assert.match(helperSource, /justifiedSections\?: GalleryTimeSection\[\];/);
    assert.match(helperSource, /if \(params\.timeSectionMode === 'decade'\)/);
    assert.match(helperSource, /if \(params\.timeSectionMode === 'decade'\) \{[\s\S]*params\.justifiedSections \?\? \[\]/);
    assert.match(helperSource, /return new Set\(\s*buildGalleryTimeSections\(params\.displayItems, params\.timeSectionMode\)/);
    assert.match(helperSource, /justifiedSections: params\.justifiedSections,/);
    assert.match(helperSource, /export function useDateTimelineJustifiedSections\(/);
    assert.match(helperSource, /const \{ displayItems, timeSectionMode, timelineGallery \} = params;/);
    assert.match(helperSource, /if \(timeSectionMode !== 'decade'\) \{/);
    assert.match(helperSource, /buildDateTimelineJustifiedSections\(displayItems, timelineGallery\.groupSummaries\)/);

    assert.match(panelContentSource, /justifiedSections\?: GalleryTimeSection\[\];/);
    assert.match(panelContentSource, /justifiedSections: props\.justifiedSections,/);
    assert.match(galleryPaneSource, /justifiedSections\?: GalleryTimeSection\[\];/);

    assert.match(layoutEngineSource, /justifiedSections\?: GalleryTimeSection\[\];/);
    assert.match(layoutEngineSource, /explicitJustifiedSections \?\? buildGalleryTimeSections\(items, timeSectionMode\)/);

    assert.match(timelineJumpSource, /export type TimelineJumpRequest = \{/);
    assert.match(timelineJumpSource, /groupId: string;/);
    assert.match(timelineJumpSource, /groupIndex: number \| null;/);
    assert.match(timelineJumpSource, /loadedGroupIds: Set<string>;/);
    assert.match(timelineJumpSource, /requestTimelineJump\(groupId, groupIndex\)/);
    assert.doesNotMatch(timelineJumpSource, /setTimelineJumpRequest\(\{ sectionId,/);

    assert.doesNotMatch(justifiedLayoutSource, /timelineJumpRequest/);
    assert.match(groupedTimelineLayoutSource, /timelineJumpRequest/);
    assert.match(groupedTimelineLayoutSource, /const groupIndex = timelineJumpRequest\.groupIndex \?\? groupIndexById\.get\(timelineJumpRequest\.groupId\);/);
    assert.match(groupedTimelineLayoutSource, /targetHeader\.scrollIntoView\(\{ block: 'start', behavior: 'auto' \}\)/);
    assert.match(groupedTimelineLayoutSource, /customScrollParent\.scrollTo\(\{ top: nextTop, behavior: 'auto' \}\)/);
    assert.match(groupedTimelineLayoutSource, /buildJustifiedLayoutRows/);
    assert.match(groupedTimelineLayoutSource, /data-time-section-id=\{group\.id\}/);
});
