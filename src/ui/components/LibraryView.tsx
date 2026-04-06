import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type UIEvent } from 'react';
import type { Asset, ReviewItemSummary } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import { getEffectiveLibrarySortMode, type LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { buildVisibleGalleryItems } from '@shared/utils/libraryGallerySelection';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { clearLibrarySelection, createEmptyLibrarySelectionState } from '@shared/utils/librarySelectionState';
import { GalleryInfoPanel } from './library/GalleryInfoPanel';
import { LibraryGalleryPane } from './library/LibraryGalleryPane';
import { getGalleryInfoPanelAsset } from './library/galleryInfoPanelModel';

interface LibraryViewProps {
    assets: Asset[];
    availableTags?: string[];
    loading: boolean;
    active: boolean;
    backendReady: boolean;
    backendStatus: string;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
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

function getAssetKeywordTags(asset: Asset) {
    return asset.photo_metadata?.projection.keywords ?? [];
}

function getAvailableTags(assets: Asset[]) {
    const uniqueTags = new Map<string, string>();
    for (const asset of assets) {
        for (const tag of getAssetKeywordTags(asset)) {
            const trimmedTag = tag.trim();
            if (!trimmedTag) {continue;}
            const normalizedTag = trimmedTag.toLowerCase();
            if (!uniqueTags.has(normalizedTag)) {
                uniqueTags.set(normalizedTag, trimmedTag);
            }
        }
    }

    return Array.from(uniqueTags.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

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
    layout,
    rejected,
    showInfoPanel,
    activeInfoTab,
    onActiveInfoTabChange,
    onShowInfoPanelChange,
    selectedInfoAsset,
    onAssignAssetTag,
    onRemoveAssetTag,
    onSetReviewItemStatus,
    onFlagPhotoDateCorrection,
}: {
    scrollRef: ReturnType<typeof useLibraryPaging>['scrollRef'];
    handleScroll: ReturnType<typeof useLibraryPaging>['handleScroll'];
    toolbar: ComponentProps<typeof LibraryGalleryPane>['toolbar'];
    layout: ComponentProps<typeof LibraryGalleryPane>['layout'];
    rejected: ComponentProps<typeof LibraryGalleryPane>['rejected'];
    showInfoPanel: boolean;
    activeInfoTab: InfoTab;
    onActiveInfoTabChange: (tab: InfoTab) => void;
    onShowInfoPanelChange: (show: boolean) => void;
    selectedInfoAsset: Asset | null;
    onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}) {
    return (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', background: '#0a0a0a' }}>
            <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
                <LibraryGalleryPane toolbar={toolbar} layout={layout} rejected={rejected} />
            </div>
            {showInfoPanel && (
                <GalleryInfoPanel
                    asset={selectedInfoAsset}
                    activeTab={activeInfoTab}
                    onTabChange={onActiveInfoTabChange}
                    onClose={() => onShowInfoPanelChange(false)}
                    onAssignTag={selectedInfoAsset && onAssignAssetTag ? (tagLabel) => onAssignAssetTag(selectedInfoAsset.id, tagLabel) : undefined}
                    onRemoveTag={selectedInfoAsset && onRemoveAssetTag ? (tagDefinitionId) => onRemoveAssetTag(selectedInfoAsset.id, tagDefinitionId) : undefined}
                    onSetReviewItemStatus={onSetReviewItemStatus}
                    onFlagPhotoDateCorrection={onFlagPhotoDateCorrection}
                />
            )}
        </div>
    );
}

export function LibraryView(props: LibraryViewProps) {
    const [sortMode, setSortMode] = useState<LibrarySortMode>('date');
    const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>('tiled');
    const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
    const selection = props.librarySelection ?? EMPTY_LIBRARY_SELECTION;
    const displayItems = useDisplayAssets(props.assets, props.declusteredAssets, sortMode, props.groupSimilarPhotos);
    const selectedInfoAsset = useLibraryInfoAsset(displayItems, selection, props.showInfoPanel, props.onEnsureAssetDetails);
    const rejectedAssetCount = getRejectedAssetCount(props.showRejected, props.rejectedAssets);
    const { scrollRef, handleScroll } = useLibraryPaging({
        active: props.active,
        displayAssetCount: displayItems.length,
        hasMoreAssets: props.hasMoreAssets,
        isLoadingMoreAssets: props.isLoadingMoreAssets,
        onLoadMoreAssets: props.onLoadMoreAssets,
    });

    useEffect(() => {
        if (props.groupSimilarPhotos && sortMode === 'group') {
            setSortMode('filename');
        }
    }, [props.groupSimilarPhotos, sortMode]);

    const handleShowInfoPanelChange = useCallback((show: boolean) => {
        props.onShowInfoPanelChange(show);
        if (!show) {
            props.onLibrarySelectionChange?.(clearLibrarySelection());
        }
    }, [props]);

    if (shouldShowLoadingState({ loading: props.loading, backendReady: props.backendReady, assetCount: props.assets.length })) {
        return <LoadingState backendStatus={props.backendStatus} backendReady={props.backendReady} />;
    }
    if (shouldShowEmptyState(props.assets.length, rejectedAssetCount)) {
        return <EmptyState />;
    }

    return (
            <LibraryPanel
                scrollRef={scrollRef}
                handleScroll={handleScroll}
                toolbar={{ sortMode, onSortModeChange: setSortMode, layoutMode, onLayoutModeChange: setLayoutMode, selectedTag: props.activeFilter?.type === 'tag' ? props.activeFilter.value : '', availableTags: props.availableTags ?? getAvailableTags(props.assets), onTagChange: props.onTagFilterChange, groupSimilarPhotos: props.groupSimilarPhotos, onGroupSimilarPhotosChange: props.onGroupSimilarPhotosChange, showGroupIds: props.showGroupIds, onShowGroupIdsChange: props.onShowGroupIdsChange, showInfoPanel: props.showInfoPanel, onShowInfoPanelChange: handleShowInfoPanelChange }}
                layout={{ items: displayItems, onAssetClick: props.onAssetClick, selectedAssetId: props.selectedAssetId, activeFilter: props.activeFilter, showFaces: props.showFaces, onUntagAsset: props.onUntagAsset, librarySelection: selection, onLibrarySelectionChange: props.onLibrarySelectionChange, declusteredAssets: props.declusteredAssets, onHoverAssetChange: props.onHoverAssetChange, showGroupIds: props.showGroupIds, hoveredGroupId, onHoveredGroupIdChange: setHoveredGroupId, layoutMode, showInfoPanel: props.showInfoPanel }}
                rejected={{ showRejected: props.showRejected, rejectedAssets: props.rejectedAssets, onAssetClick: props.onAssetClick, selectedAssetId: props.selectedAssetId }}
                showInfoPanel={props.showInfoPanel}
                activeInfoTab={props.activeInfoTab}
                onActiveInfoTabChange={props.onActiveInfoTabChange}
                onShowInfoPanelChange={handleShowInfoPanelChange}
                selectedInfoAsset={selectedInfoAsset}
                onAssignAssetTag={props.onAssignAssetTag}
                onRemoveAssetTag={props.onRemoveAssetTag}
                onSetReviewItemStatus={props.onSetReviewItemStatus}
                onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
            />
    );
}
