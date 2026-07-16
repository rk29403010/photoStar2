import type { Asset, GalleryTimelineSeek, ReviewItemSummary, SimilarityOrbit } from '@contracts/core';
import type { LibraryFilter } from '@ui/hooks/usePhotoLibrary';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { LibrarySelectableItem, LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { GalleryTimeSection, GalleryTimeSectionMode } from '../layout/galleryTimeSections';
import type { RefObject, ReactNode, UIEvent } from 'react';
import { LibraryPanel } from './LibraryPanel';
import type { TimelineJumpRequest } from './libraryTimelineJump';

type LibraryPanelContentProps = {
    readonly scrollRef: RefObject<HTMLDivElement | null>;
    readonly handleLibraryScroll: (event: UIEvent<HTMLDivElement>) => void;
    readonly toolbar: {
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
        onDeclusterSelection?: (personId: string) => void;
        onBulkTagSelection?: () => Promise<void>;
        onBulkUntagSelection?: () => Promise<void>;
        onMoveSelectionToBin?: () => Promise<void>;
        onRestoreSelectionFromBin?: () => Promise<void>;
        onClearSelection?: () => void;
        activeFilter?: LibraryFilter;
    };
    readonly timelineRail?: ReactNode;
    readonly displayItems: LibrarySelectableItem[];
    readonly onAssetClick?: (id: string) => void;
    readonly selectedAssetId?: string | null;
    readonly activeFilter?: LibraryFilter;
    readonly showFaces?: boolean;
    readonly onUntagAsset?: (assetId: string, personId: string) => void;
    readonly selection: LibrarySelectionState;
    readonly onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    readonly declusteredAssets?: Set<string>;
    readonly onHoverAssetChange?: (asset: Asset | null) => void;
    readonly showGroupIds: boolean;
    readonly hoveredGroupId: string | null;
    readonly setHoveredGroupId: (groupId: string | null) => void;
    readonly layoutMode: GalleryLayoutMode;
    readonly showInfoPanel: boolean;
    readonly isSeekingTimeline: boolean;
    readonly galleryTimelineSeek: GalleryTimelineSeek | null;
    readonly activeInfoTab: InfoTab;
    readonly onActiveInfoTabChange: (tab: InfoTab) => void;
    readonly onShowInfoPanelChange: (show: boolean) => void;
    readonly selectedInfoAsset: Asset | null;
    readonly onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    readonly onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    readonly onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    readonly onRecordPhotoMetadataAssertion?: (assetId: string, fieldPath: string, value: unknown, note?: string | null) => Promise<void>;
    readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly browseRowHeight: number;
    readonly isScrollSettled: boolean;
    readonly setTopVisibleSelectionKey: (selectionKey: string | null) => void;
    readonly onTimelineVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
    readonly justifiedSections?: GalleryTimeSection[];
    readonly timeSectionMode: GalleryTimeSectionMode;
    readonly timelineJumpRequest?: TimelineJumpRequest | null;
    readonly showRejected?: boolean;
    readonly rejectedAssets?: Asset[];
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
                onVisibleTimelineGroupChange: props.onTimelineVisibleGroupChange,
                justifiedSections: props.justifiedSections,
                timeSectionMode: props.timeSectionMode,
                timelineJumpRequest: props.timelineJumpRequest,
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
            onRecordPhotoMetadataAssertion={props.onRecordPhotoMetadataAssertion}
            onGetGroupOrbit={props.onGetGroupOrbit}
            onSetCanonical={props.onSetCanonical}
            browseRowHeight={props.browseRowHeight}
            isScrollSettled={props.isScrollSettled}
        />
    );
}
