import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type UIEvent } from 'react';
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
import type { LibraryGalleryPane } from './library/LibraryGalleryPane';
import { LibraryPanel } from './library/LibraryPanel';
import { getGalleryInfoPanelAsset } from './library/galleryInfoPanelModel';
import { getAvailableTags, getSelectedTag } from './library/libraryTagFilterModel';
import { getActiveTimelineSeek, isTimelineSortMode } from './library/libraryTimelineModel';
import {
    getLibraryToolbarProps,
    getTimelineRailElement,
    handleInfoPanelVisibilityChange,
    useViewportTimelineBucketIndex,
} from './library/libraryViewTimeline';
import { getDefaultGalleryLayoutMode, shouldPrefetchBufferedRows } from './library/galleryBrowseRailModel';
import { useGalleryBrowseRailState } from './library/libraryBrowseRailState';

interface LibraryViewProps {
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

function LoadingState({ backendStatus, backendReady }: { backendStatus: string; backendReady: boolean }) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 16 }}>
            <div className="animate-pulse" style={{ fontSize: '2rem' }}>⌛</div>
            <div style={{ textAlign: 'center' }}>
                <div>{backendStatus.includes('Error') ? backendStatus : 'Initialising photo library...'}</div>
                {!backendReady && !backendStatus.includes('Error') && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 4 }}>Establishing connection to backend service...</div>}
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 16 }}>
            <div style={{ fontSize: '3rem', opacity: 0.3 }}>📂</div>
            <div style={{ fontWeight: 500 }}>No photos found in library.</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Click &quot;Actions &gt; Scan Folder&quot; to import photos.</div>
        </div>
    );
}

function shouldLoadMore(element: HTMLDivElement, browseRowHeight: number) {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    const remainingRows = remaining / Math.max(1, browseRowHeight);
    const viewportRowCount = Math.max(1, Math.ceil(element.clientHeight / Math.max(1, browseRowHeight)));
    return shouldPrefetchBufferedRows(remainingRows, viewportRowCount);
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
}) {
    return Boolean(
        params.active
        && !params.isSeekingTimeline
        && params.container
        && params.displayAssetCount > 0
        && shouldLoadMore(params.container, params.browseRowHeight)
    );
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
    scrollRef: ReturnType<typeof useLibraryPaging>['scrollRef'];
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
    active: boolean;
    isSeekingTimeline: boolean;
    displayAssetCount: number;
    browseRowHeight: number;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    const { active, isSeekingTimeline, displayAssetCount, browseRowHeight, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets } = params;
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const requestMoreAssets = useCallback(() => {
        if (!canRequestMoreAssets({ active, isSeekingTimeline, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets })) {return;}
        void onLoadMoreAssets?.();
    }, [active, hasMoreAssets, isLoadingMoreAssets, isSeekingTimeline, onLoadMoreAssets]);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        if (shouldLoadMore(event.currentTarget, browseRowHeight)) {
            requestMoreAssets();
        }
    }, [browseRowHeight, requestMoreAssets]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!shouldAutoRequestMoreAssets({ active, isSeekingTimeline, container, displayAssetCount, browseRowHeight })) {return;}
        requestMoreAssets();
    }, [active, browseRowHeight, displayAssetCount, isSeekingTimeline, requestMoreAssets]);

    return { scrollRef, handleScroll };
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
function getLibraryPanelProps(params: {
    props: LibraryViewProps;
    scrollRef: ReturnType<typeof useLibraryPaging>['scrollRef'];
    handleLibraryScroll: ReturnType<typeof useLibraryPaging>['handleScroll'];
    toolbar: ComponentProps<typeof LibraryGalleryPane>['toolbar'];
    timelineRail?: ReactNode;
    displayItems: ReturnType<typeof useDisplayAssets>;
    selection: LibrarySelectionState;
    hoveredGroupId: string | null;
    setHoveredGroupId: (groupId: string | null) => void;
    layoutMode: GalleryLayoutMode;
    selectedInfoAsset: Asset | null;
    handleShowInfoPanelChange: (show: boolean) => void;
    browseRowHeight: number;
    isScrollSettled: boolean;
    setTopVisibleSelectionKey: (selectionKey: string | null) => void;
}) {
    return {
        scrollRef: params.scrollRef,
        handleScroll: params.handleLibraryScroll,
        toolbar: params.toolbar,
        timelineRail: params.timelineRail,
        layout: {
            items: params.displayItems,
            onAssetClick: params.props.onAssetClick,
            selectedAssetId: params.props.selectedAssetId,
            activeFilter: params.props.activeFilter,
            showFaces: params.props.showFaces,
            onUntagAsset: params.props.onUntagAsset,
            librarySelection: params.selection,
            onLibrarySelectionChange: params.props.onLibrarySelectionChange,
            declusteredAssets: params.props.declusteredAssets,
            onHoverAssetChange: params.props.onHoverAssetChange,
            showGroupIds: params.props.showGroupIds,
            hoveredGroupId: params.hoveredGroupId,
            onHoveredGroupIdChange: params.setHoveredGroupId,
            layoutMode: params.layoutMode,
            scrollContainerRef: params.scrollRef,
            showInfoPanel: params.props.showInfoPanel,
            isScrollSettled: params.isScrollSettled,
            targetRowHeight: params.browseRowHeight,
            onTopVisibleSelectionKeyChange: params.setTopVisibleSelectionKey,
        },
        rejected: {
            showRejected: params.props.showRejected,
            rejectedAssets: params.props.rejectedAssets,
            onAssetClick: params.props.onAssetClick,
            selectedAssetId: params.props.selectedAssetId,
        },
        isSeekingTimeline: params.props.isSeekingTimeline,
        galleryTimelineSeek: params.props.galleryTimelineSeek,
        showInfoPanel: params.props.showInfoPanel,
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
    } satisfies ComponentProps<typeof LibraryPanel>;
}

function useLibraryChrome(params: {
    props: LibraryViewProps;
    sortMode: LibrarySortMode;
    setSortMode: (mode: LibrarySortMode) => void;
    layoutMode: GalleryLayoutMode;
    setLayoutMode: (mode: GalleryLayoutMode) => void;
    activeTimelineSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    handleShowInfoPanelChange: (show: boolean) => void;
}) {
    const rawSelectedTag = params.props.activeFilter?.type === 'tag' ? params.props.activeFilter.value : '';
    const availableTags = useMemo(
        () => params.props.availableTags ?? getAvailableTags(params.props.assets, rawSelectedTag),
        [params.props.assets, params.props.availableTags, rawSelectedTag],
    );
    const selectedTag = useMemo(() => getSelectedTag(availableTags, rawSelectedTag), [availableTags, rawSelectedTag]);
    const toolbar = getLibraryToolbarProps({
        sortMode: params.sortMode,
        setSortMode: params.setSortMode,
        layoutMode: params.layoutMode,
        setLayoutMode: params.setLayoutMode,
        selectedTag,
        availableTags,
        onTagFilterChange: params.props.onTagFilterChange,
        groupSimilarPhotos: params.props.groupSimilarPhotos,
        onGroupSimilarPhotosChange: params.props.onGroupSimilarPhotosChange,
        showGroupIds: params.props.showGroupIds,
        onShowGroupIdsChange: params.props.onShowGroupIdsChange,
        showInfoPanel: params.props.showInfoPanel,
        handleShowInfoPanelChange: params.handleShowInfoPanelChange,
    });
    const timelineRail = getTimelineRailElement({
        timeline: params.props.stats?.timeline,
        sortMode: params.sortMode,
        activeTimelineSeek: params.activeTimelineSeek,
        viewportBucketIndex: params.viewportBucketIndex,
        onGalleryTimelineSeek: params.props.onGalleryTimelineSeek,
    });

    return { toolbar, timelineRail };
}

export function LibraryView(props: LibraryViewProps) {
    const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>(getDefaultGalleryLayoutMode);
    const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
    const [topVisibleSelectionKey, setTopVisibleSelectionKey] = useState<string | null>(null);
    const { browseRowHeight, isScrollSettled, markScrollActivity } = useGalleryBrowseRailState();
    const selection = props.librarySelection ?? EMPTY_LIBRARY_SELECTION;
    const { scrollRef, handleScroll } = useLibraryPaging({
        active: props.active,
        isSeekingTimeline: props.isSeekingTimeline,
        displayAssetCount: props.assets.length,
        browseRowHeight,
        hasMoreAssets: props.hasMoreAssets,
        isLoadingMoreAssets: props.isLoadingMoreAssets,
        onLoadMoreAssets: props.onLoadMoreAssets,
    });
    const { sortMode, setSortMode } = useLibrarySortController({
        groupSimilarPhotos: props.groupSimilarPhotos,
        onGalleryOrderChange: props.onGalleryOrderChange,
        onGalleryTimelineSeek: props.onGalleryTimelineSeek,
        scrollRef,
    });
    const displayItems = useDisplayAssets(props.assets, props.declusteredAssets, sortMode, props.groupSimilarPhotos);
    const activeTimelineSeek = useMemo(() => getActiveTimelineSeek({
        assets: props.assets,
        sortMode,
        timeline: props.stats?.timeline,
        galleryTimelineSeek: props.galleryTimelineSeek,
    }), [props.assets, props.galleryTimelineSeek, props.stats?.timeline, sortMode]);
    const { viewportBucketIndex, updateViewportBucketIndex } = useViewportTimelineBucketIndex({
        displayItems,
        timeline: props.stats?.timeline,
        activeTimelineSeek,
        visibleSelectionKey: topVisibleSelectionKey,
    });
    const selectedInfoAsset = useLibraryInfoAsset(displayItems, selection, props.showInfoPanel, props.onEnsureAssetDetails);
    const rejectedAssetCount = getRejectedAssetCount(props.showRejected, props.rejectedAssets);
    const handleShowInfoPanelChange = useCallback((show: boolean) => {
        handleInfoPanelVisibilityChange(show, props.onShowInfoPanelChange, props.onLibrarySelectionChange);
    }, [props.onLibrarySelectionChange, props.onShowInfoPanelChange]);
    const handleLibraryScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        markScrollActivity();
        handleScroll(event);
    }, [handleScroll, markScrollActivity]);
    useEffect(() => {
        updateViewportBucketIndex(topVisibleSelectionKey);
    }, [topVisibleSelectionKey, updateViewportBucketIndex]);
    const { toolbar, timelineRail } = useLibraryChrome({
        props,
        sortMode,
        setSortMode,
        layoutMode,
        setLayoutMode,
        activeTimelineSeek,
        viewportBucketIndex,
        handleShowInfoPanelChange,
    });

    if (shouldShowLoadingState({ loading: props.loading, backendReady: props.backendReady, assetCount: props.assets.length })) {
        return <LoadingState backendStatus={props.backendStatus} backendReady={props.backendReady} />;
    }
    if (shouldShowEmptyState(props.assets.length, rejectedAssetCount)) {
        return <EmptyState />;
    }

    const panelProps = getLibraryPanelProps({
        props,
        scrollRef,
        handleLibraryScroll,
        toolbar,
        timelineRail,
        displayItems,
        selection,
        hoveredGroupId,
        setHoveredGroupId,
        layoutMode,
        selectedInfoAsset,
        handleShowInfoPanelChange,
        browseRowHeight,
        isScrollSettled,
        setTopVisibleSelectionKey,
    });

    return <LibraryPanel {...panelProps} />;
}
