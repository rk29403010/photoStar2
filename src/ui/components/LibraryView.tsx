import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject, type UIEvent } from 'react';
import type { Asset, GalleryTimelineSeek, LibraryStats, ReviewItemSummary } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import { getEffectiveLibrarySortMode, getLibraryGalleryDataMode, type LibraryGalleryDataMode, type LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { buildVisibleGalleryItems } from '@shared/utils/libraryGallerySelection';
import { getLibraryViewState } from '@shared/utils/libraryViewState';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { createEmptyLibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryOrder } from '@ui/hooks/usePhotoLibrary.gallery';
import { LibraryPanelContent } from './library/LibraryPanelContent';
import { EmptyState, LoadingState } from './library/LibraryStates';
import { getGalleryInfoPanelAsset } from './library/galleryInfoPanelModel';
import { isTimelineSortMode } from './library/libraryTimelineModel';
import { useTimelineSeekScrollReset } from './library/libraryTimelineSeekScrollReset';
import { useDateTimelineJumpModel, useDateTimelineJustifiedSections, useLibraryPresentationModel } from './library/libraryViewHelpers';
import {
    getDefaultGalleryLayoutMode,
    getKeyboardScrollDelta,
    GALLERY_ROW_GAP_PX,
    shouldPrefetchBufferedRows,
    type GalleryScrollDirection,
} from './library/galleryBrowseRailModel';
import { useGalleryBrowseRailState } from './library/libraryBrowseRailState';
import type { GalleryTimeSection, GalleryTimeSectionMode } from './layout/galleryTimeSections';
import type { TimelineGalleryStateSlice } from '@ui/hooks/useTimelineGalleryState';
import { usePersistedState } from '../hooks/usePersistedState';

export interface LibraryViewProps {
    stats: LibraryStats | null;
    timelineGallery: TimelineGalleryStateSlice;
    assets: Asset[];
    galleryTimelineSeek: GalleryTimelineSeek | null;
    isSeekingTimeline: boolean;
    availableTags?: string[];
    loading: boolean;
    isRefreshingLibrary: boolean;
    active: boolean;
    backendReady: boolean;
    backendStatus: string;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
    onLoadTimelineGroupPage?: (groupId: string) => void;
    onRequestTimelineJumpTarget?: (groupId: string) => void;
    onTimelineVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
    onGalleryDataModeChange: (mode: LibraryGalleryDataMode) => void;
    onGalleryOrderChange: (order: GalleryOrder) => void;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    onTagFilterChange: (tag: string) => void;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    librarySelection?: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    showInfoPanel: boolean;
    onShowInfoPanelChange: (show: boolean) => void;
    activeInfoTab: InfoTab;
    onActiveInfoTabChange: (tab: InfoTab) => void;
    groupSimilarPhotos: boolean;
    onGroupSimilarPhotosChange: (enabled: boolean) => void;
    showGroupIds: boolean;
    onShowGroupIdsChange: (enabled: boolean) => void;
    declusteredAssets?: Set<string>;
    showRejected?: boolean;
    rejectedAssets?: Asset[];
    onHoverAssetChange?: (asset: Asset | null) => void;
    onEnsureAssetDetails?: (assetId: string) => void;
    onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}

const EMPTY_LIBRARY_SELECTION = createEmptyLibrarySelectionState();

function shouldLoadMore(params: {
    element: HTMLDivElement;
    browseRowHeight: number;
    scrollDirection: GalleryScrollDirection;
    pixelsPerMs: number;
    averageBatchLoadMs: number;
}) {
    const rowExtent = Math.max(1, params.browseRowHeight + GALLERY_ROW_GAP_PX);
    const remaining = params.element.scrollHeight - params.element.scrollTop - params.element.clientHeight;
    const remainingRows = remaining / rowExtent;
    const viewportRowCount = Math.max(1, Math.ceil(params.element.clientHeight / rowExtent));
    return shouldPrefetchBufferedRows({
        remainingRows,
        viewportRowCount,
        scrollDirection: params.scrollDirection,
        pixelsPerMs: params.pixelsPerMs,
        rowHeight: params.browseRowHeight,
        averageBatchLoadMs: params.averageBatchLoadMs,
    });
}

function canRequestMoreAssets(params: {
    active: boolean;
    isSeekingTimeline: boolean;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    return Boolean(
        params.active
        && !params.isSeekingTimeline
        && params.hasMoreAssets
        && !params.isLoadingMoreAssets
        && params.onLoadMoreAssets
    );
}

function shouldAutoRequestMoreAssets(params: {
    active: boolean;
    isSeekingTimeline: boolean;
    container: HTMLDivElement | null;
    displayAssetCount: number;
    browseRowHeight: number;
    averageBatchLoadMs: number;
}) {
    return Boolean(
        params.active
        && !params.isSeekingTimeline
        && params.container
        && params.displayAssetCount > 0
        && shouldLoadMore({
            element: params.container,
            browseRowHeight: params.browseRowHeight,
            scrollDirection: 'down',
            pixelsPerMs: 0,
            averageBatchLoadMs: params.averageBatchLoadMs,
        })
    );
}

function isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {return false;}
    return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target.isContentEditable;
}

function getTimeSectionMode(sortMode: LibrarySortMode, layoutMode: GalleryLayoutMode): GalleryTimeSectionMode {
    if (layoutMode !== 'justified') {return 'none';}
    return sortMode === 'date' || sortMode === 'reverse-date' ? 'decade' : 'none';
}

function getRejectedAssetCount(showRejected?: boolean, rejectedAssets?: Asset[]) {
    return showRejected && rejectedAssets ? rejectedAssets.length : 0;
}

function useDisplayAssets(
    assets: Asset[],
    declusteredAssets: Set<string> | undefined,
    sortMode: LibrarySortMode,
    groupSimilarPhotos: boolean,
) {
    return useMemo(() => {
        return buildVisibleGalleryItems(assets, {
            declusteredAssetIds: declusteredAssets,
            sortMode: getEffectiveLibrarySortMode(sortMode, groupSimilarPhotos),
            groupSimilarPhotos,
        });
    }, [assets, declusteredAssets, groupSimilarPhotos, sortMode]);
}

function getGalleryOrderForSortMode(sortMode: LibrarySortMode): GalleryOrder {
    return sortMode === 'reverse-date' ? 'oldest_first' : 'default';
}

function useLatestRef<T>(value: T) {
    const valueRef = useRef(value);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    return valueRef;
}

function useLibrarySortController(params: {
    active: boolean;
    groupSimilarPhotos: boolean;
    onGalleryDataModeChange: (mode: LibraryGalleryDataMode) => void;
    onGalleryOrderChange: (order: GalleryOrder) => void;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
    scrollRef: MutableRefObject<HTMLDivElement | null>;
}) {
    const [sortMode, setSortMode] = usePersistedState<LibrarySortMode>('ps_library_sort_mode', 'date');
    const { active, groupSimilarPhotos, onGalleryDataModeChange, onGalleryOrderChange, onGalleryTimelineSeek, scrollRef } = params;
    const effectiveSortMode = getEffectiveLibrarySortMode(sortMode, groupSimilarPhotos);
    const onGalleryDataModeChangeRef = useLatestRef(onGalleryDataModeChange);
    const onGalleryOrderChangeRef = useLatestRef(onGalleryOrderChange);
    const onGalleryTimelineSeekRef = useLatestRef(onGalleryTimelineSeek);

    useEffect(() => {
        if (!active) {
            return;
        }
        const scrollContainer = scrollRef.current;
        onGalleryDataModeChangeRef.current(getLibraryGalleryDataMode(effectiveSortMode));
        onGalleryOrderChangeRef.current(getGalleryOrderForSortMode(effectiveSortMode));
        if (!isTimelineSortMode(effectiveSortMode)) {
            onGalleryTimelineSeekRef.current(null);
        }
        scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
    }, [active, effectiveSortMode, onGalleryDataModeChangeRef, onGalleryOrderChangeRef, onGalleryTimelineSeekRef, scrollRef]);

    return { sortMode: effectiveSortMode, setSortMode };
}

function useLibraryPaging(params: {
    scrollRef: MutableRefObject<HTMLDivElement | null>;
    active: boolean;
    isSeekingTimeline: boolean;
    displayAssetCount: number;
    browseRowHeight: number;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    const { active, isSeekingTimeline, displayAssetCount, browseRowHeight, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets, scrollRef } = params;
    const averageBatchLoadMsRef = useRef(320);
    const lastScrollSampleRef = useRef<{ top: number; at: number }>({ top: 0, at: 0 });

    const requestMoreAssets = useCallback(async () => {
        if (!canRequestMoreAssets({ active, isSeekingTimeline, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets })) {return;}
        const startedAt = performance.now();
        await onLoadMoreAssets?.();
        const elapsed = performance.now() - startedAt;
        averageBatchLoadMsRef.current = Math.round((averageBatchLoadMsRef.current * 0.7) + (elapsed * 0.3));
    }, [active, hasMoreAssets, isLoadingMoreAssets, isSeekingTimeline, onLoadMoreAssets]);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        const now = performance.now();
        const previousSample = lastScrollSampleRef.current;
        const deltaTop = event.currentTarget.scrollTop - previousSample.top;
        const deltaTime = Math.max(1, now - previousSample.at);
        const pixelsPerMs = deltaTop / deltaTime;
        const scrollDirection: GalleryScrollDirection = deltaTop > 0 ? 'down' : deltaTop < 0 ? 'up' : 'idle';
        lastScrollSampleRef.current = { top: event.currentTarget.scrollTop, at: now };

        if (shouldLoadMore({
            element: event.currentTarget,
            browseRowHeight,
            scrollDirection,
            pixelsPerMs,
            averageBatchLoadMs: averageBatchLoadMsRef.current,
        })) {
            void requestMoreAssets();
        }
    }, [browseRowHeight, requestMoreAssets]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!active || isTypingTarget(event.target)) {return;}
            const container = scrollRef.current;
            if (!container) {return;}
            const delta = getKeyboardScrollDelta({
                key: event.key,
                browseRowHeight,
                viewportHeight: container.clientHeight,
                rowGap: GALLERY_ROW_GAP_PX,
            });
            if (delta === 0) {return;}

            event.preventDefault();
            container.scrollBy({ top: delta, behavior: 'auto' });
        };

        globalThis.addEventListener('keydown', handleKeyDown);
        return () => globalThis.removeEventListener('keydown', handleKeyDown);
    }, [active, browseRowHeight, scrollRef]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!shouldAutoRequestMoreAssets({
            active,
            isSeekingTimeline,
            container,
            displayAssetCount,
            browseRowHeight,
            averageBatchLoadMs: averageBatchLoadMsRef.current,
        })) {return;}
        void requestMoreAssets();
    }, [active, browseRowHeight, displayAssetCount, isSeekingTimeline, requestMoreAssets, scrollRef]);

    return { handleScroll };
}

function useLibraryInfoAsset(
    displayItems: ReturnType<typeof useDisplayAssets>,
    selection: LibrarySelectionState,
    showInfoPanel: boolean,
    onEnsureAssetDetails?: (assetId: string) => void,
) {
    const requestedInfoAssetIdRef = useRef<string | null>(null);
    const selectedInfoAsset = useMemo(() => getGalleryInfoPanelAsset(displayItems, selection), [displayItems, selection]);
    const selectedInfoAssetId = selectedInfoAsset?.id ?? null;

    useEffect(() => {
        if (!showInfoPanel || !selectedInfoAssetId) {
            requestedInfoAssetIdRef.current = null;
            return;
        }

        if (requestedInfoAssetIdRef.current === selectedInfoAssetId) {
            return;
        }

        requestedInfoAssetIdRef.current = selectedInfoAssetId;
        onEnsureAssetDetails?.(selectedInfoAssetId);
    }, [onEnsureAssetDetails, selectedInfoAssetId, showInfoPanel]);

    return selectedInfoAsset;
}


function getLibraryPanelContentProps(params: {
    props: LibraryViewProps;
    handleLibraryScroll: (event: UIEvent<HTMLDivElement>) => void;
    toolbar: ComponentProps<typeof LibraryPanelContent>['toolbar'];
    timelineRail?: ComponentProps<typeof LibraryPanelContent>['timelineRail'];
    displayItems: ReturnType<typeof useDisplayAssets>;
    selection: LibrarySelectionState;
    hoveredGroupId: string | null;
    setHoveredGroupId: (groupId: string | null) => void;
    layoutMode: GalleryLayoutMode;
    handleShowInfoPanelChange: (show: boolean) => void;
    selectedInfoAsset: Asset | null;
    browseRowHeight: number;
    isScrollSettled: boolean;
    setTopVisibleSelectionKey: (selectionKey: string | null) => void;
    justifiedSections?: GalleryTimeSection[];
    timeSectionMode: GalleryTimeSectionMode;
    timelineJumpRequest?: ComponentProps<typeof LibraryPanelContent>['timelineJumpRequest'];
    onTimelineVisibleGroupChange?: ComponentProps<typeof LibraryPanelContent>['onTimelineVisibleGroupChange'];
}): Omit<ComponentProps<typeof LibraryPanelContent>, 'scrollRef'> {
    return {
        handleLibraryScroll: params.handleLibraryScroll,
        toolbar: params.toolbar,
        timelineRail: params.timelineRail,
        displayItems: params.displayItems,
        onAssetClick: params.props.onAssetClick,
        selectedAssetId: params.props.selectedAssetId,
        activeFilter: params.props.activeFilter,
        showFaces: params.props.showFaces,
        onUntagAsset: params.props.onUntagAsset,
        selection: params.selection,
        onLibrarySelectionChange: params.props.onLibrarySelectionChange,
        declusteredAssets: params.props.declusteredAssets,
        onHoverAssetChange: params.props.onHoverAssetChange,
        showGroupIds: params.props.showGroupIds,
        hoveredGroupId: params.hoveredGroupId,
        setHoveredGroupId: params.setHoveredGroupId,
        layoutMode: params.layoutMode,
        showInfoPanel: params.props.showInfoPanel,
        isSeekingTimeline: params.props.isSeekingTimeline,
        galleryTimelineSeek: params.props.galleryTimelineSeek,
        activeInfoTab: params.props.activeInfoTab,
        onActiveInfoTabChange: params.props.onActiveInfoTabChange,
        onShowInfoPanelChange: params.handleShowInfoPanelChange,
        selectedInfoAsset: params.selectedInfoAsset,
        onAssignAssetTag: params.props.onAssignAssetTag,
        onRemoveAssetTag: params.props.onRemoveAssetTag,
        onSetReviewItemStatus: params.props.onSetReviewItemStatus,
        onFlagPhotoDateCorrection: params.props.onFlagPhotoDateCorrection,
        browseRowHeight: params.browseRowHeight,
        isScrollSettled: params.isScrollSettled,
        setTopVisibleSelectionKey: params.setTopVisibleSelectionKey,
        onTimelineVisibleGroupChange: params.onTimelineVisibleGroupChange,
        justifiedSections: params.justifiedSections,
        timeSectionMode: params.timeSectionMode,
        timelineJumpRequest: params.timelineJumpRequest,
        showRejected: params.props.showRejected,
        rejectedAssets: params.props.rejectedAssets,
    };
}

function renderLibraryViewStatus(params: {
    loading: boolean;
    backendReady: boolean;
    backendStatus: string;
    assetCount: number;
    rejectedAssetCount: number;
    isRefreshingLibrary: boolean;
}) {
    const viewState = getLibraryViewState({
        assetCount: params.assetCount,
        rejectedAssetCount: params.rejectedAssetCount,
        loading: params.loading,
        backendReady: params.backendReady,
        isRefreshingLibrary: params.isRefreshingLibrary,
    });

    if (viewState === 'loading') {
        return <LoadingState backendStatus={params.backendStatus} backendReady={params.backendReady} />;
    }
    return viewState === 'empty' ? <EmptyState /> : null;
}

function getLibraryViewStatusFromProps(props: Pick<
LibraryViewProps,
'loading' | 'backendReady' | 'backendStatus' | 'assets' | 'showRejected' | 'rejectedAssets' | 'isRefreshingLibrary'
>) {
    return renderLibraryViewStatus({
        loading: props.loading,
        backendReady: props.backendReady,
        backendStatus: props.backendStatus,
        assetCount: props.assets.length,
        rejectedAssetCount: getRejectedAssetCount(props.showRejected, props.rejectedAssets),
        isRefreshingLibrary: props.isRefreshingLibrary,
    });
}

function buildPanelProps(params: {
    props: LibraryViewProps;
    handleLibraryScroll: (event: UIEvent<HTMLDivElement>) => void;
    toolbar: ComponentProps<typeof LibraryPanelContent>['toolbar'];
    timelineRail?: ComponentProps<typeof LibraryPanelContent>['timelineRail'];
    displayItems: ReturnType<typeof useDisplayAssets>;
    selection: LibrarySelectionState;
    hoveredGroupId: string | null;
    setHoveredGroupId: (groupId: string | null) => void;
    layoutMode: GalleryLayoutMode;
    handleShowInfoPanelChange: (show: boolean) => void;
    selectedInfoAsset: Asset | null;
    browseRowHeight: number;
    isScrollSettled: boolean;
    setTopVisibleSelectionKey: (selectionKey: string | null) => void;
    justifiedSections?: GalleryTimeSection[];
    timeSectionMode: GalleryTimeSectionMode;
    timelineJumpRequest?: ComponentProps<typeof LibraryPanelContent>['timelineJumpRequest'];
}) {
    return getLibraryPanelContentProps({
        ...params,
        onTimelineVisibleGroupChange: params.props.onTimelineVisibleGroupChange,
    });
}

export function LibraryView(props: LibraryViewProps) {
    const [layoutMode, setLayoutMode] = usePersistedState<GalleryLayoutMode>('ps_library_layout_mode', getDefaultGalleryLayoutMode());
    const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const { browseRowHeight, isScrollSettled, markScrollActivity } = useGalleryBrowseRailState();
    const selection = props.librarySelection ?? EMPTY_LIBRARY_SELECTION;
    const { sortMode, setSortMode } = useLibrarySortController({
        active: props.active,
        groupSimilarPhotos: props.groupSimilarPhotos,
        onGalleryDataModeChange: props.onGalleryDataModeChange,
        onGalleryOrderChange: props.onGalleryOrderChange,
        onGalleryTimelineSeek: props.onGalleryTimelineSeek,
        scrollRef,
    });
    const displayItems = useDisplayAssets(props.assets, props.declusteredAssets, sortMode, props.groupSimilarPhotos);
    const timeSectionMode = useMemo(() => getTimeSectionMode(sortMode, layoutMode), [layoutMode, sortMode]);
    const justifiedSections = useDateTimelineJustifiedSections({
        displayItems,
        timeSectionMode,
        timelineGallery: props.timelineGallery,
    });
    const { handleTimelineJump, handleTimelineBucketJump, timelineJumpRequest } = useDateTimelineJumpModel({
        displayItems,
        timeSectionMode,
        timelineGallery: props.timelineGallery,
        justifiedSections,
        onLoadTimelineGroupPage: props.onLoadTimelineGroupPage,
        onRequestTimelineJumpTarget: props.onRequestTimelineJumpTarget,
        layoutMode,
        sortMode,
        onGalleryTimelineSeek: props.onGalleryTimelineSeek,
    });
    const { handleScroll } = useLibraryPaging({
        scrollRef,
        active: props.active,
        isSeekingTimeline: props.isSeekingTimeline,
        displayAssetCount: displayItems.length,
        browseRowHeight,
        hasMoreAssets: props.hasMoreAssets,
        isLoadingMoreAssets: props.isLoadingMoreAssets,
        onLoadMoreAssets: props.onLoadMoreAssets,
    });
    const {
        setTopVisibleSelectionKey,
        handleLibraryScroll,
        toolbar,
        timelineRail,
        handleShowInfoPanelChange,
    } = useLibraryPresentationModel({
        props,
        sortMode,
        setSortMode,
        layoutMode,
        setLayoutMode,
        displayItems,
        markScrollActivity,
        handleScroll,
        handleTimelineJump,
        handleTimelineBucketJump,
        timelineVisibleGroupId: props.timelineGallery.visibleGroupId,
        timelineVisibleGroupIndex: props.timelineGallery.visibleGroupIndex,
    });
    useTimelineSeekScrollReset(scrollRef, props.galleryTimelineSeek, props.isSeekingTimeline);
    const selectedInfoAsset = useLibraryInfoAsset(displayItems, selection, props.showInfoPanel, props.onEnsureAssetDetails);
    const statusView = getLibraryViewStatusFromProps(props);
    if (statusView) {return statusView;}
    const panelProps = buildPanelProps({
        props,
        handleLibraryScroll,
        toolbar,
        timelineRail,
        displayItems,
        selection,
        hoveredGroupId,
        setHoveredGroupId,
        layoutMode,
        handleShowInfoPanelChange,
        selectedInfoAsset,
        browseRowHeight,
        isScrollSettled,
        setTopVisibleSelectionKey,
        justifiedSections,
        timeSectionMode,
        timelineJumpRequest,
    });

    return <LibraryPanelContent {...panelProps} scrollRef={scrollRef} />;
}
