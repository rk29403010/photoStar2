import { useCallback, useEffect, useState } from 'react';
import type { GalleryTimelineSeek, LibraryStats } from '@contracts/core';
import { clearLibrarySelection, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { LibraryTimelineRail } from './LibraryTimelineRail';
import { createSelectionKeyTimelineBucketIndex, isTimelineSortMode } from './libraryTimelineModel';

function findViewportTimelineBucketIndex(
    visibleSelectionKey: string | null,
    fallbackSelectionKey: string | null,
    selectionKeyToBucketIndex: Map<string, number>,
) {
    const selectionKey = visibleSelectionKey ?? fallbackSelectionKey;
    if (!selectionKey) {
        return null;
    }
    return selectionKeyToBucketIndex.get(selectionKey) ?? null;
}

export function useViewportTimelineBucketIndex(params: {
    displayItems: LibrarySelectableItem[];
    timeline: LibraryStats['timeline'] | undefined;
    activeTimelineSeek: GalleryTimelineSeek | null;
    visibleSelectionKey: string | null;
}) {
    const [viewportBucketIndex, setViewportBucketIndex] = useState<number | null>(null);
    const selectionKeyToBucketIndex = createSelectionKeyTimelineBucketIndex(params.displayItems, params.timeline);
    const fallbackSelectionKey = params.displayItems[0]?.selectionKey ?? null;

    const updateViewportBucketIndex = useCallback((visibleSelectionKey: string | null) => {
        const nextViewportBucketIndex = findViewportTimelineBucketIndex(visibleSelectionKey, fallbackSelectionKey, selectionKeyToBucketIndex);
        if (nextViewportBucketIndex != null) {
            setViewportBucketIndex(nextViewportBucketIndex);
        }
    }, [fallbackSelectionKey, selectionKeyToBucketIndex]);

    useEffect(() => {
        updateViewportBucketIndex(params.visibleSelectionKey);
    }, [params.activeTimelineSeek, params.visibleSelectionKey, updateViewportBucketIndex]);

    return { viewportBucketIndex, updateViewportBucketIndex };
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
    timeline: LibraryStats['timeline'] | undefined;
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
