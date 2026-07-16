import { useCallback } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary, TimelineGroupId } from '@contracts/core';
import { clearLibrarySelection, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { LibraryTimelineRail } from './LibraryTimelineRail';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { createSelectionKeyTimelineBucketIndex, isTimelineSortMode } from './libraryTimelineModel';

function getTimelineGroupIdForBucketStartYear(startYear: number): TimelineGroupId {
    return `decade-${startYear}`;
}

function findViewportTimelineBucketIndex(
    visibleSelectionKey: string | null,
    selectionKeyToBucketIndex: Map<string, number>,
) {
    if (!visibleSelectionKey) {
        return null;
    }
    return selectionKeyToBucketIndex.get(visibleSelectionKey) ?? null;
}

export function useViewportTimelineBucketIndex(params: {
    displayItems: LibrarySelectableItem[];
    timeline: LibraryTimelineSummary | null;
    activeTimelineSeek: GalleryTimelineSeek | null;
    visibleSelectionKey: string | null;
    scrollVisibleTimelineGroupId: TimelineGroupId | null;
    visibleTimelineGroupId: TimelineGroupId | null;
    visibleTimelineGroupIndex: number | null;
}) {
    const syncViewportBucketIndexFromScrollContainer = useCallback((_container: HTMLDivElement) => {}, []);
    const visibleTimelineGroupId = params.visibleTimelineGroupId ?? params.scrollVisibleTimelineGroupId;

    if (visibleTimelineGroupId && params.timeline) {
        const groupedBucketIndex = params.timeline.buckets.findIndex((bucket) => (
            getTimelineGroupIdForBucketStartYear(bucket.startYear) === visibleTimelineGroupId
        ));
        if (groupedBucketIndex >= 0) {
            return {
                viewportBucketIndex: groupedBucketIndex,
                syncViewportBucketIndexFromScrollContainer,
            };
        }
    }

    if (typeof params.visibleTimelineGroupIndex === 'number') {
        return {
            viewportBucketIndex: null,
            syncViewportBucketIndexFromScrollContainer,
        };
    }

    const selectionKeyToBucketIndex = createSelectionKeyTimelineBucketIndex(params.displayItems, params.timeline);
    const selectionBucketIndex = findViewportTimelineBucketIndex(params.visibleSelectionKey, selectionKeyToBucketIndex);
    const viewportBucketIndex = selectionBucketIndex;

    return { viewportBucketIndex, syncViewportBucketIndexFromScrollContainer };
}

export function getLibraryToolbarProps(params: {
    sortMode: LibrarySortMode;
    setSortMode: (mode: LibrarySortMode) => void;
    layoutMode: GalleryLayoutMode;
    setLayoutMode: (mode: GalleryLayoutMode) => void;
    selectedTag: string;
    availableTags: string[];
    onTagFilterChange: (tag: string) => void;
    groupSimilarPhotos: boolean;
    onGroupSimilarPhotosChange: (enabled: boolean) => void;
    showGroupIds: boolean;
    onShowGroupIdsChange: (enabled: boolean) => void;
    showInfoPanel: boolean;
    handleShowInfoPanelChange: (show: boolean) => void;
    onDeclusterSelection?: (personId: string) => void;
    onBulkTagSelection?: () => Promise<void>;
    onBulkUntagSelection?: () => Promise<void>;
    onMoveSelectionToBin?: () => Promise<void>;
    onRestoreSelectionFromBin?: () => Promise<void>;
    onClearSelection?: () => void;
    activeFilter?: LibraryFilter;
}) {
    return {
        sortMode: params.sortMode,
        onSortModeChange: params.setSortMode,
        layoutMode: params.layoutMode,
        onLayoutModeChange: params.setLayoutMode,
        selectedTag: params.selectedTag,
        availableTags: params.availableTags,
        onTagChange: params.onTagFilterChange,
        groupSimilarPhotos: params.groupSimilarPhotos,
        onGroupSimilarPhotosChange: params.onGroupSimilarPhotosChange,
        showGroupIds: params.showGroupIds,
        onShowGroupIdsChange: params.onShowGroupIdsChange,
        showInfoPanel: params.showInfoPanel,
        onShowInfoPanelChange: params.handleShowInfoPanelChange,
        onDeclusterSelection: params.onDeclusterSelection,
        onBulkTagSelection: params.onBulkTagSelection,
        onBulkUntagSelection: params.onBulkUntagSelection,
        onMoveSelectionToBin: params.onMoveSelectionToBin,
        onRestoreSelectionFromBin: params.onRestoreSelectionFromBin,
        onClearSelection: params.onClearSelection,
        activeFilter: params.activeFilter,
    };
}

export function getTimelineRailElement(params: {
    timeline: LibraryTimelineSummary | null;
    sortMode: LibrarySortMode;
    activeTimelineSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
    onTimelineBucketJump: (bucket: LibraryTimelineSummary['buckets'][number]) => void;
}) {
    if (!params.timeline || !isTimelineSortMode(params.sortMode)) {
        return undefined;
    }

    return (
        <LibraryTimelineRail
            timeline={params.timeline}
            sortMode={params.sortMode}
            activeSeek={params.activeTimelineSeek}
            viewportBucketIndex={params.viewportBucketIndex}
            onSeekChange={params.onGalleryTimelineSeek}
            onBucketJump={params.onTimelineBucketJump}
        />
    );
}

export function handleInfoPanelVisibilityChange(
    show: boolean,
    onShowInfoPanelChange: (show: boolean) => void,
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void,
) {
    onShowInfoPanelChange(show);
    if (!show) {
        onLibrarySelectionChange?.(clearLibrarySelection());
    }
}
