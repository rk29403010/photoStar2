import { useMemo, type UIEvent } from 'react';
import type { GalleryTimelineSeek, LibraryStats, TimelineGroupId } from '@contracts/core';
import type { Asset } from '@contracts/core';
import type { LibraryFilter } from '@ui/hooks/usePhotoLibrary';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import { getActiveTimelineSeek, getTimelineSummaryForGalleryMode } from './libraryTimelineModel';
import { useLibraryChrome } from './libraryViewChrome';
import { useLibraryTimelineSync } from './libraryViewTimelineSync';

export function useLibraryViewPresentation(params: {
    assets: Asset[];
    activeFilter?: LibraryFilter;
    availableTags?: string[];
    stats: LibraryStats | null;
    galleryTimelineSeek: GalleryTimelineSeek | null;
    sortMode: LibrarySortMode;
    setSortMode: (mode: LibrarySortMode) => void;
    layoutMode: GalleryLayoutMode;
    setLayoutMode: (mode: GalleryLayoutMode) => void;
    displayItems: LibrarySelectableItem[];
    markScrollActivity: () => void;
    handleScroll: (event: UIEvent<HTMLDivElement>) => void;
    onTagFilterChange: (tag: string) => void;
    groupSimilarPhotos: boolean;
    onGroupSimilarPhotosChange: (enabled: boolean) => void;
    showGroupIds: boolean;
    onShowGroupIdsChange: (enabled: boolean) => void;
    showInfoPanel: boolean;
    handleShowInfoPanelChange: (show: boolean) => void;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
    onTimelineBucketJump: (bucket: NonNullable<LibraryStats['timeline']>['buckets'][number]) => void;
    timelineVisibleGroupId: TimelineGroupId | null;
    timelineVisibleGroupIndex: number | null;
    onDeclusterSelection?: (personId: string) => void;
    onBulkTagSelection?: () => Promise<void>;
    onBulkUntagSelection?: () => Promise<void>;
    onMoveSelectionToBin?: () => Promise<void>;
    onRestoreSelectionFromBin?: () => Promise<void>;
    onClearSelection?: () => void;
}) {
    const timeline = useMemo(() => getTimelineSummaryForGalleryMode(params.stats, params.groupSimilarPhotos), [params.groupSimilarPhotos, params.stats]);
    const activeTimelineSeek = useMemo(() => getActiveTimelineSeek({
        displayItems: params.displayItems,
        sortMode: params.sortMode,
        timeline,
        galleryTimelineSeek: params.galleryTimelineSeek,
    }), [params.displayItems, params.galleryTimelineSeek, params.sortMode, timeline]);
    const timelineSync = useLibraryTimelineSync({
        displayItems: params.displayItems,
        timeline,
        activeTimelineSeek,
        visibleTimelineGroupId: params.timelineVisibleGroupId,
        visibleTimelineGroupIndex: params.timelineVisibleGroupIndex,
        markScrollActivity: params.markScrollActivity,
        handleScroll: params.handleScroll,
    });
    const chrome = useLibraryChrome({
        activeFilter: params.activeFilter,
        availableTags: params.availableTags,
        assets: params.assets,
        timeline,
        sortMode: params.sortMode,
        setSortMode: params.setSortMode,
        layoutMode: params.layoutMode,
        setLayoutMode: params.setLayoutMode,
        activeTimelineSeek,
        viewportBucketIndex: timelineSync.viewportBucketIndex,
        onTagFilterChange: params.onTagFilterChange,
        groupSimilarPhotos: params.groupSimilarPhotos,
        onGroupSimilarPhotosChange: params.onGroupSimilarPhotosChange,
        showGroupIds: params.showGroupIds,
        onShowGroupIdsChange: params.onShowGroupIdsChange,
        showInfoPanel: params.showInfoPanel,
        handleShowInfoPanelChange: params.handleShowInfoPanelChange,
        onGalleryTimelineSeek: params.onGalleryTimelineSeek,
        onTimelineBucketJump: params.onTimelineBucketJump,
        onDeclusterSelection: params.onDeclusterSelection,
        onBulkTagSelection: params.onBulkTagSelection,
        onBulkUntagSelection: params.onBulkUntagSelection,
        onMoveSelectionToBin: params.onMoveSelectionToBin,
        onRestoreSelectionFromBin: params.onRestoreSelectionFromBin,
        onClearSelection: params.onClearSelection,
    });

    return {
        activeTimelineSeek,
        ...timelineSync,
        ...chrome,
    };
}
