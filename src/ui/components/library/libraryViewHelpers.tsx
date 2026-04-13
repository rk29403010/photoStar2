import { useCallback, useMemo, type UIEvent } from 'react';
import type { GalleryTimelineSeek } from '@contracts/core';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import { buildGalleryTimeSections, type GalleryTimeSectionMode } from '../layout/galleryTimeSections';
import { handleInfoPanelVisibilityChange } from './libraryViewTimeline';
import { useLibraryViewPresentation } from './libraryViewPresentation';
import type { LibraryViewProps } from '../LibraryView';

export function useLoadedTimelineSectionIds(displayItems: LibrarySelectableItem[], timeSectionMode: GalleryTimeSectionMode) {
    return useMemo(() => new Set(
        buildGalleryTimeSections(displayItems, timeSectionMode)
            .map((section) => section.id),
    ), [displayItems, timeSectionMode]);
}

export function useLibraryPresentationModel(params: {
    props: LibraryViewProps;
    sortMode: LibrarySortMode;
    setSortMode: (mode: LibrarySortMode) => void;
    layoutMode: GalleryLayoutMode;
    setLayoutMode: (mode: GalleryLayoutMode) => void;
    displayItems: LibrarySelectableItem[];
    markScrollActivity: () => void;
    handleScroll: (event: UIEvent<HTMLDivElement>) => void;
    handleTimelineJump: (seek: GalleryTimelineSeek | null) => void;
}) {
    const handleShowInfoPanelChange = useCallback((show: boolean) => {
        handleInfoPanelVisibilityChange(show, params.props.onShowInfoPanelChange, params.props.onLibrarySelectionChange);
    }, [params.props.onLibrarySelectionChange, params.props.onShowInfoPanelChange]);

    return {
        handleShowInfoPanelChange,
        ...useLibraryViewPresentation({
            assets: params.props.assets,
            activeFilter: params.props.activeFilter,
            availableTags: params.props.availableTags,
            stats: params.props.stats,
            galleryTimelineSeek: params.props.galleryTimelineSeek,
            sortMode: params.sortMode,
            setSortMode: params.setSortMode,
            layoutMode: params.layoutMode,
            setLayoutMode: params.setLayoutMode,
            displayItems: params.displayItems,
            markScrollActivity: params.markScrollActivity,
            handleScroll: params.handleScroll,
            onTagFilterChange: params.props.onTagFilterChange,
            groupSimilarPhotos: params.props.groupSimilarPhotos,
            onGroupSimilarPhotosChange: params.props.onGroupSimilarPhotosChange,
            showGroupIds: params.props.showGroupIds,
            onShowGroupIdsChange: params.props.onShowGroupIdsChange,
            showInfoPanel: params.props.showInfoPanel,
            handleShowInfoPanelChange,
            onGalleryTimelineSeek: params.handleTimelineJump,
        }),
    };
}
