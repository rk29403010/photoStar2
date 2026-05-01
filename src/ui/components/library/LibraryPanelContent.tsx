import type { Asset, GalleryTimelineSeek, ReviewItemSummary } from '@contracts/core';
import type { LibraryFilter } from '@ui/hooks/usePhotoLibrary';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { LibrarySelectableItem, LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { GalleryTimeSectionMode } from '../layout/galleryTimeSections';
import type { MutableRefObject, ReactNode, UIEvent } from 'react';
import { LibraryPanel } from './LibraryPanel';
import type { TimelineJumpRequest } from './libraryTimelineJump';

interface LibraryPanelContentProps {
    scrollRef: MutableRefObject<HTMLDivElement | null>;
    handleLibraryScroll: (event: UIEvent<HTMLDivElement>) => void;
    toolbar: {
        sortMode: 'filename' | 'date' | 'reverse-date' | 'group';
        onSortModeChange: (mode: 'filename' | 'date' | 'reverse-date' | 'group') => void;
        layoutMode: GalleryLayoutMode;
        onLayoutModeChange: (mode: GalleryLayoutMode) => void;
        selectedTag: string;
        availableTags: string[];
        onTagChange: (tag: string) => void;
        groupSimilarPhotos: boolean;
        onGroupSimilarPhotosChange: (enabled: boolean) => void;
        showGroupIds: boolean;
        onShowGroupIdsChange: (enabled: boolean) => void;
        showInfoPanel: boolean;
        onShowInfoPanelChange: (show: boolean) => void;
    };
    timelineRail?: ReactNode;
    displayItems: LibrarySelectableItem[];
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    selection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    declusteredAssets?: Set<string>;
    onHoverAssetChange?: (asset: Asset | null) => void;
    showGroupIds: boolean;
    hoveredGroupId: string | null;
    setHoveredGroupId: (groupId: string | null) => void;
    layoutMode: GalleryLayoutMode;
    showInfoPanel: boolean;
    isSeekingTimeline: boolean;
    galleryTimelineSeek: GalleryTimelineSeek | null;
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
    browseRowHeight: number;
    isScrollSettled: boolean;
    setTopVisibleSelectionKey: (selectionKey: string | null) => void;
    setTopVisibleSectionId: (sectionId: string | null) => void;
    restoreSelectionKey: string | null;
    timeSectionMode: GalleryTimeSectionMode;
    timelineJumpRequest?: TimelineJumpRequest | null;
    showRejected?: boolean;
    rejectedAssets?: Asset[];
}

export function LibraryPanelContent(props: LibraryPanelContentProps) {
    return (
        <LibraryPanel
            scrollRef={props.scrollRef}
            handleScroll={props.handleLibraryScroll}
            toolbar={props.toolbar}
            timelineRail={props.timelineRail}
            layout={{
                items: props.displayItems,
                onAssetClick: props.onAssetClick,
                selectedAssetId: props.selectedAssetId,
                activeFilter: props.activeFilter,
                showFaces: props.showFaces,
                onUntagAsset: props.onUntagAsset,
                librarySelection: props.selection,
                onLibrarySelectionChange: props.onLibrarySelectionChange,
                declusteredAssets: props.declusteredAssets,
                onHoverAssetChange: props.onHoverAssetChange,
                showGroupIds: props.showGroupIds,
                hoveredGroupId: props.hoveredGroupId,
                onHoveredGroupIdChange: props.setHoveredGroupId,
                layoutMode: props.layoutMode,
                scrollContainerRef: props.scrollRef,
                showInfoPanel: props.showInfoPanel,
                isScrollSettled: props.isScrollSettled,
                targetRowHeight: props.browseRowHeight,
                onTopVisibleSelectionKeyChange: props.setTopVisibleSelectionKey,
                onTopVisibleSectionIdChange: props.setTopVisibleSectionId,
                timeSectionMode: props.timeSectionMode,
                timelineJumpRequest: props.timelineJumpRequest,
                restoreSelectionKey: props.restoreSelectionKey,
            }}
            rejected={{
                showRejected: props.showRejected,
                rejectedAssets: props.rejectedAssets,
                onAssetClick: props.onAssetClick,
                selectedAssetId: props.selectedAssetId,
            }}
            isSeekingTimeline={props.isSeekingTimeline}
            galleryTimelineSeek={props.galleryTimelineSeek}
            showInfoPanel={props.showInfoPanel}
            activeInfoTab={props.activeInfoTab}
            onActiveInfoTabChange={props.onActiveInfoTabChange}
            onShowInfoPanelChange={props.onShowInfoPanelChange}
            selectedInfoAsset={props.selectedInfoAsset}
            onAssignAssetTag={props.onAssignAssetTag}
            onRemoveAssetTag={props.onRemoveAssetTag}
            onSetReviewItemStatus={props.onSetReviewItemStatus}
            onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
            browseRowHeight={props.browseRowHeight}
            isScrollSettled={props.isScrollSettled}
        />
    );
}
