import type { TimelineGroupId } from '@contracts/core';
import { useCallback, useMemo, type UIEvent } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineBucket } from '@contracts/core';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import { buildGalleryTimeSections, type GalleryTimeSection, type GalleryTimeSectionMode } from '../layout/galleryTimeSections';
import { handleInfoPanelVisibilityChange } from './libraryViewTimeline';
import { useLibraryViewPresentation } from './libraryViewPresentation';
import { useLibraryTimelineJump } from './libraryTimelineJump';
import { getTimelineSeekForBucket } from './libraryTimelineModel';
import type { LibraryViewProps } from '../LibraryView';
import type { TimelineGalleryStateSlice } from '@ui/hooks/useTimelineGalleryState';
import { buildDateTimelineJustifiedSections } from './libraryTimelineSections';

export function useLoadedTimelineGroupIds(params: {
    displayItems: LibrarySelectableItem[];
    timeSectionMode: GalleryTimeSectionMode;
    timelineGallery: TimelineGalleryStateSlice;
    justifiedSections?: GalleryTimeSection[];
}) {
    return useMemo(() => {
        if (params.timeSectionMode === 'decade') {
            return new Set((params.justifiedSections ?? []).map((section) => section.id as TimelineGroupId));
        }

        return new Set(
            buildGalleryTimeSections(params.displayItems, params.timeSectionMode)
                .map((section) => section.id as TimelineGroupId),
        );
    }, [params.displayItems, params.justifiedSections, params.timeSectionMode]);
}

export function useTimelineGroupIndexById(timelineGallery: TimelineGalleryStateSlice) {
    return useMemo(() => new Map(
        timelineGallery.groupSummaries.map((groupSummary, groupIndex) => [groupSummary.id, groupIndex] as const),
    ), [timelineGallery.groupSummaries]);
}

function useTimelineGroupIndexBySectionId(sections: GalleryTimeSection[] | undefined) {
    return useMemo(() => new Map(
        (sections ?? []).map((section, groupIndex) => [section.id, groupIndex] as const),
    ), [sections]);
}

export function useDateTimelineJustifiedSections(params: {
    displayItems: LibrarySelectableItem[];
    timeSectionMode: GalleryTimeSectionMode;
    timelineGallery: TimelineGalleryStateSlice;
}) {
    const { displayItems, timeSectionMode, timelineGallery } = params;

    return useMemo<GalleryTimeSection[] | undefined>(() => {
        if (timeSectionMode !== 'decade') {
            return undefined;
        }
        return buildDateTimelineJustifiedSections(displayItems, timelineGallery.groupSummaries);
    }, [displayItems, timeSectionMode, timelineGallery.groupSummaries]);
}

export function useDateTimelineJumpModel(params: {
    displayItems: LibrarySelectableItem[];
    timeSectionMode: GalleryTimeSectionMode;
    timelineGallery: TimelineGalleryStateSlice;
    justifiedSections?: GalleryTimeSection[];
    onLoadTimelineGroupPage?: (groupId: string) => void;
    onRequestTimelineJumpTarget?: (groupId: string) => void;
    layoutMode: GalleryLayoutMode;
    sortMode: LibrarySortMode;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
}) {
    const loadedTimelineGroupIds = useLoadedTimelineGroupIds({
        displayItems: params.displayItems,
        timeSectionMode: params.timeSectionMode,
        timelineGallery: params.timelineGallery,
        justifiedSections: params.justifiedSections,
    });
    const visibleTimelineGroupIndexById = useTimelineGroupIndexBySectionId(params.justifiedSections);
    const groupedTimelineIndexById = useTimelineGroupIndexById(params.timelineGallery);
    const timelineGroupIndexById = params.timeSectionMode === 'decade'
        ? visibleTimelineGroupIndexById
        : groupedTimelineIndexById;

    const timelineJump = useLibraryTimelineJump({
        loadedGroupIds: loadedTimelineGroupIds,
        loadingByGroupId: params.timelineGallery.loadingByGroupId,
        onLoadTimelineGroupPage: params.onLoadTimelineGroupPage,
        onRequestTimelineJumpTarget: params.onRequestTimelineJumpTarget,
        timelineGroupIndexById,
        layoutMode: params.layoutMode,
        sortMode: params.sortMode,
        onGalleryTimelineSeek: params.onGalleryTimelineSeek,
    });

    const handleTimelineBucketJump = useCallback((bucket: {
        label: string;
        startYear: number;
        endYear: number;
        startDate: string;
        endDate: string;
        count: number;
    }) => {
        const groupId = `decade-${bucket.startYear}`;
        timelineJump.jumpToTimelineGroup(
            groupId,
            getTimelineSeekForBucket(bucket, params.sortMode === 'reverse-date' ? 'reverse-date' : 'date'),
        );
    }, [params.sortMode, timelineJump]);

    return {
        ...timelineJump,
        handleTimelineBucketJump,
    };
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
    handleTimelineBucketJump: (bucket: LibraryTimelineBucket) => void;
    timelineVisibleGroupId: TimelineGroupId | null;
    timelineVisibleGroupIndex: number | null;
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
            onTimelineBucketJump: params.handleTimelineBucketJump,
            timelineVisibleGroupId: params.timelineVisibleGroupId,
            timelineVisibleGroupIndex: params.timelineVisibleGroupIndex,
        }),
    };
}
