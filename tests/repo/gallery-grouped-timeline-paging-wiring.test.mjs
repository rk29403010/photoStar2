import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('grouped timeline request-id helpers match the real emitted command ids', async () => {
    const {
        isTimelineGroupPageRequestId,
        isTimelineJumpTargetRequestId,
    } = await import('../../src/shared/utils/libraryTimelineRequestIds.ts');

    assert.equal(isTimelineGroupPageRequestId('get_timeline_group_page-123'), true);
    assert.equal(isTimelineGroupPageRequestId('timeline-group-page-123'), false);
    assert.equal(isTimelineJumpTargetRequestId('get_timeline_jump_target-789'), true);
    assert.equal(isTimelineJumpTargetRequestId('timeline-jump-target-789'), false);
});

test('date-mode gallery wiring loads a full in-memory timeline without blocking on grouped backend sync', () => {
    const sharedGallerySource = fs.readFileSync('src/shared/utils/libraryGallery.ts', 'utf8');
    const stateSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.state.ts', 'utf8');
    const compositionSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.composition.ts', 'utf8');
    const galleryPayloadSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.gallery.ts', 'utf8');
    const hookSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8');
    const coreActionsSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.coreActions.ts', 'utf8');
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');
    const appMainContentSource = fs.readFileSync('src/ui/components/app/AppMainContent.tsx', 'utf8');
    const loadedAppShellSource = fs.readFileSync('src/ui/components/app/LoadedAppShell.tsx', 'utf8');
    const commandsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.commands.ts', 'utf8');
    const connectionSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.connection.ts', 'utf8');
    const messageSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.connection.messages.ts', 'utf8');

    assert.match(sharedGallerySource, /export type LibraryGalleryDataMode = 'flat' \| 'grouped-timeline';/);
    assert.match(sharedGallerySource, /getLibraryGalleryDataMode\(sortMode: LibrarySortMode\)/);
    assert.match(sharedGallerySource, /sortMode === 'date' \|\| sortMode === 'reverse-date'/);
    assert.match(stateSource, /galleryDataModeRef = useRef<LibraryGalleryDataMode>\('grouped-timeline'\)/);
    assert.match(stateSource, /galleryDataModeRef,/);
    assert.match(compositionSource, /galleryDataModeRef: state\.galleryDataModeRef/);

    assert.match(galleryPayloadSource, /buildTimelineGroupsPayload/);
    assert.match(galleryPayloadSource, /command: 'get_assets'/);
    assert.match(galleryPayloadSource, /groupBy: 'decade'/);
    assert.match(galleryPayloadSource, /buildTimelineGroupPagePayload/);
    assert.match(galleryPayloadSource, /groupId: params\.groupId/);
    assert.match(galleryPayloadSource, /cursor: params\.cursor \?\? null/);
    assert.match(galleryPayloadSource, /buildTimelineJumpTargetPayload/);
    assert.match(galleryPayloadSource, /groupId: params\.groupId/);

    assert.match(libraryViewSource, /onGalleryDataModeChange: \(mode: LibraryGalleryDataMode\) => void;/);
    assert.match(libraryViewSource, /getLibraryGalleryDataMode\(effectiveSortMode\)/);
    assert.match(libraryViewSource, /if \(!active\) \{\s*return;\s*\}/);
    assert.match(libraryViewSource, /onGalleryDataModeChangeRef\.current\(getLibraryGalleryDataMode\(effectiveSortMode\)\)/);
    assert.match(appMainContentSource, /onGalleryDataModeChange: \(mode: LibraryGalleryDataMode\) => void;/);
    assert.match(appMainContentSource, /onGalleryDataModeChange=\{props\.onGalleryDataModeChange\}/);
    assert.match(loadedAppShellSource, /onGalleryDataModeChange=\{actions\.setGalleryDataMode\}/);

    assert.match(coreActionsSource, /galleryDataModeRef: PhotoLibraryState\['galleryDataModeRef'\];/);
    assert.match(coreActionsSource, /const setGalleryDataMode = useCallback/);
    assert.match(coreActionsSource, /galleryDataModeRef\.current === mode/);
    assert.match(coreActionsSource, /galleryDataModeRef\.current = mode/);
    assert.match(coreActionsSource, /return \{ setGalleryDataMode, setGalleryOrder, setGroupSimilarPhotos, seekGalleryTimeline \};/);

    assert.match(commandsSource, /sendCommand\('get_timeline_group_page'/);
    assert.match(commandsSource, /sendCommand\('get_timeline_jump_target'/);
    assert.match(commandsSource, /sendCommand\('get_assets'/);

    assert.match(hookSource, /galleryDataModeRef: state\.galleryDataModeRef/);
    assert.match(hookSource, /createTimelinePagingActions/);
    assert.match(hookSource, /\.\.\.timelinePagingActions/);
    assert.doesNotMatch(hookSource, /void sendCommand\('get_timeline_groups', buildTimelineGroupsPayload\(/);

    assert.doesNotMatch(connectionSource, /command: 'get_timeline_groups'/);
    assert.doesNotMatch(connectionSource, /id: 'timeline-groups-init'/);
    assert.match(connectionSource, /galleryDataModeRef: \{ current: LibraryGalleryDataMode \};/);
    assert.match(connectionSource, /shouldIncludeTimelineGroups\(_galleryDataMode: LibraryGalleryDataMode\)/);
    assert.match(connectionSource, /shouldIncludeTimelineGroups\(deps\.paramsRef\.current\.galleryDataModeRef\.current\)/);
    assert.match(connectionSource, /includeTimelineGroups/);
    assert.match(connectionSource, /return _galleryDataMode === 'grouped-timeline';/);
    assert.match(connectionSource, /command: 'get_assets'/);
    assert.match(connectionSource, /const initialAssetLimit = includeTimelineGroups \? GROUPED_TIMELINE_ASSET_LIMIT : ASSET_PAGE_SIZE;/);

    assert.doesNotMatch(messageSource, /'timeline-groups-init'/);
    assert.match(messageSource, /isTimelineGroupPageRequestId\(id\)/);
    assert.match(messageSource, /isTimelineJumpTargetRequestId\(id\)/);
    assert.match(messageSource, /params\.setIsLoadingMoreAssets\(false\)/);
    assert.match(messageSource, /params\.setIsSeekingTimeline\(false\)/);
    assert.match(messageSource, /isAssetPageResponseId/);
});
