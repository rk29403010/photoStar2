import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type UIEvent } from 'react';
import type { Asset, GalleryTimelineSeek, LibraryStats } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import { getEffectiveLibrarySortMode, type LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { buildVisibleGalleryItems } from '@shared/utils/libraryGallerySelection';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { createEmptyLibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryOrder } from '@ui/hooks/usePhotoLibrary.gallery';
import { GalleryInfoPanel } from './library/GalleryInfoPanel';
import { LibraryGalleryPane } from './library/LibraryGalleryPane';
import { getGalleryInfoPanelAsset } from './library/galleryInfoPanelModel';
import { getActiveTimelineSeek, isTimelineSortMode } from './library/libraryTimelineModel';
import {
    getLibraryToolbarProps,
    getTimelineRailElement,
    handleInfoPanelVisibilityChange,
    useViewportTimelineBucketIndex,
} from './library/libraryViewTimeline';

interface LibraryViewProps {
    stats: LibraryStats | null;
    assets: Asset[];
    galleryTimelineSeek: GalleryTimelineSeek | null;
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

function shouldLoadMore(element: HTMLDivElement) {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    return remaining < 720;
}

function canRequestMoreAssets(params: {
    active: boolean;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    return Boolean(
        params.active
        && params.hasMoreAssets
        && !params.isLoadingMoreAssets
        && params.onLoadMoreAssets
    );
}

function shouldAutoRequestMoreAssets(params: {
    active: boolean;
    container: HTMLDivElement | null;
    displayAssetCount: number;
}) {
    return Boolean(
        params.active
        && params.container
        && params.displayAssetCount > 0
        && shouldLoadMore(params.container)
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

function getAssetTags(asset: Asset) {
    return asset.photo_metadata?.projection.keywords ?? [];
}

function getTagKey(tag: string) {
    return tag.trim().toLocaleLowerCase();
}

function getAvailableTags(assets: Asset[], selectedTag: string) {
    const tagsByKey = new Map<string, string>();
    for (const asset of assets) {
        for (const tag of getAssetTags(asset)) {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
                const key = getTagKey(trimmedTag);
                if (!tagsByKey.has(key)) {
                    tagsByKey.set(key, trimmedTag);
                }
            }
        }
    }

    const trimmedSelectedTag = selectedTag.trim();
    if (trimmedSelectedTag) {
        const key = getTagKey(trimmedSelectedTag);
        if (!tagsByKey.has(key)) {
            tagsByKey.set(key, trimmedSelectedTag);
        }
    }

    return Array.from(tagsByKey.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function getSelectedTag(availableTags: string[], rawSelectedTag: string) {
    if (!rawSelectedTag) {
        return '';
    }
    return availableTags.find((tag) => getTagKey(tag) === getTagKey(rawSelectedTag)) ?? rawSelectedTag;
}

function useLibraryPaging(params: {
    active: boolean;
    displayAssetCount: number;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    const { active, displayAssetCount, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets } = params;
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const requestMoreAssets = useCallback(() => {
        if (!canRequestMoreAssets({ active, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets })) {return;}
        void onLoadMoreAssets?.();
    }, [active, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets]);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        if (shouldLoadMore(event.currentTarget)) {
            requestMoreAssets();
        }
    }, [requestMoreAssets]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!shouldAutoRequestMoreAssets({ active, container, displayAssetCount })) {return;}
        requestMoreAssets();
    }, [active, displayAssetCount, requestMoreAssets]);

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


function LibraryPanel({
    scrollRef,
    handleScroll,
    toolbar,
    timelineRail,
    layout,
    rejected,
    showInfoPanel,
    activeInfoTab,
    onActiveInfoTabChange,
    onShowInfoPanelChange,
    selectedInfoAsset,
    onFlagPhotoDateCorrection,
}: {
    scrollRef: ReturnType<typeof useLibraryPaging>['scrollRef'];
    handleScroll: ReturnType<typeof useLibraryPaging>['handleScroll'];
    toolbar: ComponentProps<typeof LibraryGalleryPane>['toolbar'];
    timelineRail?: ReactNode;
    layout: ComponentProps<typeof LibraryGalleryPane>['layout'];
    rejected: ComponentProps<typeof LibraryGalleryPane>['rejected'];
    showInfoPanel: boolean;
    activeInfoTab: InfoTab;
    onActiveInfoTabChange: (tab: InfoTab) => void;
    onShowInfoPanelChange: (show: boolean) => void;
    selectedInfoAsset: Asset | null;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}) {
    return (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', background: '#0a0a0a' }}>
            {timelineRail}
            <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
                <LibraryGalleryPane toolbar={toolbar} layout={layout} rejected={rejected} />
            </div>
            {showInfoPanel && (
                <GalleryInfoPanel asset={selectedInfoAsset} activeTab={activeInfoTab} onTabChange={onActiveInfoTabChange} onClose={() => onShowInfoPanelChange(false)} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} />
            )}
        </div>
    );
}

export function LibraryView(props: LibraryViewProps) {
    const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>('tiled');
    const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
    const selection = props.librarySelection ?? EMPTY_LIBRARY_SELECTION;
    const { scrollRef, handleScroll } = useLibraryPaging({
        active: props.active,
        displayAssetCount: props.assets.length,
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
    const rawSelectedTag = props.activeFilter?.type === 'tag' ? (props.activeFilter.tag ?? '') : '';
    const availableTags = useMemo(() => getAvailableTags(props.assets, rawSelectedTag), [props.assets, rawSelectedTag]);
    const selectedTag = useMemo(() => getSelectedTag(availableTags, rawSelectedTag), [availableTags, rawSelectedTag]);
    const displayItems = useDisplayAssets(props.assets, props.declusteredAssets, sortMode, props.groupSimilarPhotos);
    const activeTimelineSeek = useMemo(() => getActiveTimelineSeek({
        assets: props.assets,
        sortMode,
        timeline: props.stats?.timeline,
        galleryTimelineSeek: props.galleryTimelineSeek,
    }), [props.assets, props.galleryTimelineSeek, props.stats?.timeline, sortMode]);
    const { viewportBucketIndex, updateViewportBucketIndex } = useViewportTimelineBucketIndex({
        scrollRef,
        displayItems,
        timeline: props.stats?.timeline,
        activeTimelineSeek,
    });
    const selectedInfoAsset = useLibraryInfoAsset(displayItems, selection, props.showInfoPanel, props.onEnsureAssetDetails);
    const rejectedAssetCount = getRejectedAssetCount(props.showRejected, props.rejectedAssets);
    const handleShowInfoPanelChange = useCallback((show: boolean) => {
        handleInfoPanelVisibilityChange(show, props.onShowInfoPanelChange, props.onLibrarySelectionChange);
    }, [props.onLibrarySelectionChange, props.onShowInfoPanelChange]);
    const handleLibraryScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        handleScroll(event);
        updateViewportBucketIndex(event.currentTarget);
    }, [handleScroll, updateViewportBucketIndex]);

    if (shouldShowLoadingState({ loading: props.loading, backendReady: props.backendReady, assetCount: props.assets.length })) {
        return <LoadingState backendStatus={props.backendStatus} backendReady={props.backendReady} />;
    }
    if (shouldShowEmptyState(props.assets.length, rejectedAssetCount)) {
        return <EmptyState />;
    }

    const toolbar = getLibraryToolbarProps({
        sortMode,
        setSortMode,
        layoutMode,
        setLayoutMode,
        selectedTag,
        availableTags,
        onTagFilterChange: props.onTagFilterChange,
        groupSimilarPhotos: props.groupSimilarPhotos,
        onGroupSimilarPhotosChange: props.onGroupSimilarPhotosChange,
        showGroupIds: props.showGroupIds,
        onShowGroupIdsChange: props.onShowGroupIdsChange,
        showInfoPanel: props.showInfoPanel,
        handleShowInfoPanelChange,
    });
    const timelineRail = getTimelineRailElement({
        timeline: props.stats?.timeline,
        sortMode,
        activeTimelineSeek,
        viewportBucketIndex,
        onGalleryTimelineSeek: props.onGalleryTimelineSeek,
    });

    return (
        <LibraryPanel
            scrollRef={scrollRef}
            handleScroll={handleLibraryScroll}
            toolbar={toolbar}
            timelineRail={timelineRail}
            layout={{ items: displayItems, onAssetClick: props.onAssetClick, selectedAssetId: props.selectedAssetId, activeFilter: props.activeFilter, showFaces: props.showFaces, onUntagAsset: props.onUntagAsset, librarySelection: selection, onLibrarySelectionChange: props.onLibrarySelectionChange, declusteredAssets: props.declusteredAssets, onHoverAssetChange: props.onHoverAssetChange, showGroupIds: props.showGroupIds, hoveredGroupId, onHoveredGroupIdChange: setHoveredGroupId, layoutMode, showInfoPanel: props.showInfoPanel }}
            rejected={{ showRejected: props.showRejected, rejectedAssets: props.rejectedAssets, onAssetClick: props.onAssetClick, selectedAssetId: props.selectedAssetId }}
            showInfoPanel={props.showInfoPanel}
            activeInfoTab={props.activeInfoTab}
            onActiveInfoTabChange={props.onActiveInfoTabChange}
            onShowInfoPanelChange={handleShowInfoPanelChange}
            selectedInfoAsset={selectedInfoAsset}
            onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
        />
    );
}
