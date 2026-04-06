import { useCallback, useEffect, useState } from 'react';
import type { GalleryTimelineSeek, LibraryStats } from '@contracts/core';
import { clearLibrarySelection, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { LibraryTimelineRail } from './LibraryTimelineRail';
import { createSelectionKeyTimelineBucketIndex, isTimelineSortMode } from './libraryTimelineModel';

function findViewportTimelineBucketIndex(
    scrollContainer: HTMLDivElement | null,
    selectionKeyToBucketIndex: Map<string, number>,
) {
    if (!scrollContainer) {
        return null;
    }

    const containerTop = scrollContainer.getBoundingClientRect().top;
    const tiles = Array.from(scrollContainer.querySelectorAll<HTMLElement>('[data-selection-key]'));
    let nearestBucketIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const tile of tiles) {
        const selectionKey = tile.getAttribute('data-selection-key');
        if (!selectionKey) {
            continue;
        }
        const bucketIndex = selectionKeyToBucketIndex.get(selectionKey);
        if (bucketIndex == null) {
            continue;
        }
        const distance = Math.abs(tile.getBoundingClientRect().top - containerTop);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestBucketIndex = bucketIndex;
        }
    }

    return nearestBucketIndex;
}

export function useViewportTimelineBucketIndex(params: {
    scrollRef: { current: HTMLDivElement | null };
    displayItems: LibrarySelectableItem[];
    timeline: LibraryStats['timeline'] | undefined;
    activeTimelineSeek: GalleryTimelineSeek | null;
}) {
    const [viewportBucketIndex, setViewportBucketIndex] = useState<number | null>(null);
    const selectionKeyToBucketIndex = createSelectionKeyTimelineBucketIndex(params.displayItems, params.timeline);

    const updateViewportBucketIndex = useCallback((scrollContainer: HTMLDivElement | null) => {
        const nextViewportBucketIndex = findViewportTimelineBucketIndex(scrollContainer, selectionKeyToBucketIndex);
        if (nextViewportBucketIndex != null) {
            setViewportBucketIndex(nextViewportBucketIndex);
        }
    }, [selectionKeyToBucketIndex]);

    useEffect(() => {
        updateViewportBucketIndex(params.scrollRef.current);
    }, [params.activeTimelineSeek, params.scrollRef, updateViewportBucketIndex]);

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
