import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject, type UIEvent } from 'react';
import type { Asset, GalleryTimelineSeek, LibraryStats, ReviewItemSummary } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import { getEffectiveLibrarySortMode, type LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { buildVisibleGalleryItems } from '@shared/utils/libraryGallerySelection';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { createEmptyLibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryOrder } from '@ui/hooks/usePhotoLibrary.gallery';
import { LibraryPanelContent } from './library/LibraryPanelContent';
import { EmptyState, LoadingState } from './library/LibraryStates';
import { getGalleryInfoPanelAsset } from './library/galleryInfoPanelModel';
import { isTimelineSortMode } from './library/libraryTimelineModel';
import { useTimelineSeekScrollReset } from './library/libraryTimelineSeekScrollReset';
import { useLibraryTimelineJump } from './library/libraryTimelineJump';
import { useLibraryPresentationModel, useLoadedTimelineSectionIds } from './library/libraryViewHelpers';
import {
    getDefaultGalleryLayoutMode,
    getKeyboardScrollDelta,
    GALLERY_ROW_GAP_PX,
    shouldPrefetchBufferedRows,
    type GalleryScrollDirection,
} from './library/galleryBrowseRailModel';
import { useGalleryBrowseRailState } from './library/libraryBrowseRailState';
import type { GalleryTimeSectionMode } from './layout/galleryTimeSections';

export interface LibraryViewProps {
    stats: LibraryStats | null;
    assets: Asset[];
    galleryTimelineSeek: GalleryTimelineSeek | null;
    isSeekingTimeline: boolean;
    availableTags?: string[];
    loading: boolean;
    active: boolean;
    backendReady: boolean;
    backendStatus: string;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
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

function shouldShowLoadingState(params: { loading: boolean; backendReady: boolean; assetCount: number }) {
    const { loading, backendReady, assetCount } = params;
    return assetCount === 0 && (loading || !backendReady);
}

function shouldShowEmptyState(assetCount: number, rejectedAssetCount: number) {
    return assetCount === 0 && rejectedAssetCount === 0;
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

function useLibrarySortController(params: {
    groupSimilarPhotos: boolean;
    onGalleryOrderChange: (order: GalleryOrder) => void;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
    scrollRef: MutableRefObject<HTMLDivElement | null>;
}) {
    const [sortMode, setSortMode] = useState<LibrarySortMode>('date');
    const { groupSimilarPhotos, onGalleryOrderChange, onGalleryTimelineSeek, scrollRef } = params;

    useEffect(() => {
        if (groupSimilarPhotos && sortMode === 'group') {
            setSortMode('filename');
        }
    }, [groupSimilarPhotos, sortMode]);

    useEffect(() => {
        const scrollContainer = scrollRef.current;
        onGalleryOrderChange(getGalleryOrderForSortMode(sortMode));
        if (!isTimelineSortMode(sortMode)) {
            onGalleryTimelineSeek(null);
        }
        scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
    }, [onGalleryOrderChange, onGalleryTimelineSeek, scrollRef, sortMode]);

    return { sortMode, setSortMode };
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

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
    const selectedInfoAsset = useMemo(() => getGalleryInfoPanelAsset(displayItems, selection), [displayItems, selection]);
    const selectedInfoAssetId = selectedInfoAsset?.id ?? null;

    useEffect(() => {
        if (!showInfoPanel || !selectedInfoAssetId) {
            return;
        }

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
    timeSectionMode: GalleryTimeSectionMode;
    timelineJumpRequest?: ComponentProps<typeof LibraryPanelContent>['timelineJumpRequest'];
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
}) {
    if (shouldShowLoadingState({ loading: params.loading, backendReady: params.backendReady, assetCount: params.assetCount })) {
        return <LoadingState backendStatus={params.backendStatus} backendReady={params.backendReady} />;
    }
    return shouldShowEmptyState(params.assetCount, params.rejectedAssetCount) ? <EmptyState /> : null;
}

export function LibraryView(props: LibraryViewProps) {
    const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>(getDefaultGalleryLayoutMode);
    const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const { browseRowHeight, isScrollSettled, markScrollActivity } = useGalleryBrowseRailState();
    const selection = props.librarySelection ?? EMPTY_LIBRARY_SELECTION;
    const { sortMode, setSortMode } = useLibrarySortController({
        groupSimilarPhotos: props.groupSimilarPhotos,
        onGalleryOrderChange: props.onGalleryOrderChange,
        onGalleryTimelineSeek: props.onGalleryTimelineSeek,
        scrollRef,
    });
    const displayItems = useDisplayAssets(props.assets, props.declusteredAssets, sortMode, props.groupSimilarPhotos);
    const timeSectionMode = useMemo(() => getTimeSectionMode(sortMode, layoutMode), [layoutMode, sortMode]);
    const loadedTimelineSectionIds = useLoadedTimelineSectionIds(displayItems, timeSectionMode);
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
    const { handleTimelineJump, timelineJumpRequest } = useLibraryTimelineJump({
        hasMoreAssets: props.hasMoreAssets,
        onLoadMoreAssets: props.onLoadMoreAssets,
        loadedSectionIds: loadedTimelineSectionIds,
        layoutMode,
        sortMode,
        onGalleryTimelineSeek: props.onGalleryTimelineSeek,
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
    });
    useTimelineSeekScrollReset(scrollRef, props.galleryTimelineSeek, props.isSeekingTimeline);
    const selectedInfoAsset = useLibraryInfoAsset(displayItems, selection, props.showInfoPanel, props.onEnsureAssetDetails);
    const rejectedAssetCount = getRejectedAssetCount(props.showRejected, props.rejectedAssets);
    const statusView = renderLibraryViewStatus({
        loading: props.loading,
        backendReady: props.backendReady,
        backendStatus: props.backendStatus,
        assetCount: props.assets.length,
        rejectedAssetCount,
    });
    if (statusView) {return statusView;}
    const panelProps = getLibraryPanelContentProps({
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
        timeSectionMode,
        timelineJumpRequest,
    });

    return <LibraryPanelContent {...panelProps} scrollRef={scrollRef} />;
}
