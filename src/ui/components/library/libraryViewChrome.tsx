import { useMemo } from 'react';
import type { Asset, GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import type { LibraryFilter } from '@ui/hooks/usePhotoLibrary';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { getAvailableTags, getSelectedTag } from './libraryTagFilterModel';
import { getLibraryToolbarProps, getTimelineRailElement } from './libraryViewTimeline';

export function useLibraryChrome(params: {
    activeFilter?: LibraryFilter;
    availableTags?: string[];
    assets: Asset[];
    timeline: LibraryTimelineSummary | null;
    sortMode: LibrarySortMode;
    setSortMode: (mode: LibrarySortMode) => void;
    layoutMode: GalleryLayoutMode;
    setLayoutMode: (mode: GalleryLayoutMode) => void;
    activeTimelineSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    onTagFilterChange: (tag: string) => void;
    groupSimilarPhotos: boolean;
    onGroupSimilarPhotosChange: (enabled: boolean) => void;
    showGroupIds: boolean;
    onShowGroupIdsChange: (enabled: boolean) => void;
    showInfoPanel: boolean;
    handleShowInfoPanelChange: (show: boolean) => void;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
    onTimelineBucketJump: (bucket: NonNullable<LibraryTimelineSummary>['buckets'][number]) => void;
}) {
    const rawSelectedTag = params.activeFilter?.type === 'tag' ? params.activeFilter.value : '';
    const availableTags = useMemo(
        () => params.availableTags ?? getAvailableTags(params.assets, rawSelectedTag),
        [params.assets, params.availableTags, rawSelectedTag],
    );
    const selectedTag = useMemo(() => getSelectedTag(availableTags, rawSelectedTag), [availableTags, rawSelectedTag]);
    const toolbar = getLibraryToolbarProps({
        sortMode: params.sortMode,
        setSortMode: params.setSortMode,
        layoutMode: params.layoutMode,
        setLayoutMode: params.setLayoutMode,
        selectedTag,
        availableTags,
        onTagFilterChange: params.onTagFilterChange,
        groupSimilarPhotos: params.groupSimilarPhotos,
        onGroupSimilarPhotosChange: params.onGroupSimilarPhotosChange,
        showGroupIds: params.showGroupIds,
        onShowGroupIdsChange: params.onShowGroupIdsChange,
        showInfoPanel: params.showInfoPanel,
        handleShowInfoPanelChange: params.handleShowInfoPanelChange,
    });
    const timelineRail = getTimelineRailElement({
        timeline: params.timeline,
        sortMode: params.sortMode,
        activeTimelineSeek: params.activeTimelineSeek,
        viewportBucketIndex: params.viewportBucketIndex,
        onGalleryTimelineSeek: params.onGalleryTimelineSeek,
        onTimelineBucketJump: params.onTimelineBucketJump,
    });

    return { toolbar, timelineRail };
}
