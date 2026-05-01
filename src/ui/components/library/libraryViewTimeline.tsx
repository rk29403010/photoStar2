import { useCallback } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import { clearLibrarySelection, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { LibraryTimelineRail } from './LibraryTimelineRail';
import { isTimelineSortMode } from './libraryTimelineModel';

function getTimelineSectionIdForBucketStartYear(startYear: number) {
    return `decade-${startYear}`;
}

function findViewportTimelineBucketIndex(
    visibleSectionId: string | null,
    sectionIdToBucketIndex: Map<string, number>,
) {
    if (!visibleSectionId) {
        return null;
    }
    return sectionIdToBucketIndex.get(visibleSectionId) ?? null;
}

export function useViewportTimelineBucketIndex(params: {
    displayItems: LibrarySelectableItem[];
    timeline: LibraryTimelineSummary | null;
    activeTimelineSeek: GalleryTimelineSeek | null;
    visibleSectionId: string | null;
}) {
    const sectionIdToBucketIndex = new Map(
        (params.timeline?.buckets ?? []).map((bucket, index) => [getTimelineSectionIdForBucketStartYear(bucket.startYear), index] as const),
    );
    const viewportBucketIndex = findViewportTimelineBucketIndex(params.visibleSectionId, sectionIdToBucketIndex);
    const syncViewportBucketIndexFromScrollContainer = useCallback((_container: HTMLDivElement) => {}, []);

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
    };
}

export function getTimelineRailElement(params: {
    timeline: LibraryTimelineSummary | null;
    sortMode: LibrarySortMode;
    activeTimelineSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
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
