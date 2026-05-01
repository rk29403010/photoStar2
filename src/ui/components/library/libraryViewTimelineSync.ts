import { useCallback, useState, type UIEvent } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary, TimelineGroupId } from '@contracts/core';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import {
    getTopVisibleSelectionKeyFromScrollContainer,
    getTopVisibleTimelineGroupIdFromScrollContainer,
} from './libraryVisibleSelectionKey';
import { useViewportTimelineBucketIndex } from './libraryViewTimeline';

export function useLibraryTimelineSync(params: {
    displayItems: LibrarySelectableItem[];
    timeline: LibraryTimelineSummary | null;
    activeTimelineSeek: GalleryTimelineSeek | null;
    visibleTimelineGroupId: TimelineGroupId | null;
    visibleTimelineGroupIndex: number | null;
    markScrollActivity: () => void;
    handleScroll: (event: UIEvent<HTMLDivElement>) => void;
}) {
    const { activeTimelineSeek, displayItems, handleScroll, markScrollActivity, timeline, visibleTimelineGroupId, visibleTimelineGroupIndex } = params;
    const [topVisibleSelectionKey, setTopVisibleSelectionKey] = useState<string | null>(null);
    const [topVisibleTimelineGroupId, setTopVisibleTimelineGroupId] = useState<TimelineGroupId | null>(null);
    const { viewportBucketIndex, syncViewportBucketIndexFromScrollContainer } = useViewportTimelineBucketIndex({
        displayItems,
        timeline,
        activeTimelineSeek,
        visibleSelectionKey: topVisibleSelectionKey,
        scrollVisibleTimelineGroupId: topVisibleTimelineGroupId,
        visibleTimelineGroupId,
        visibleTimelineGroupIndex,
    });

    const handleLibraryScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        const nextSelectionKey = getTopVisibleSelectionKeyFromScrollContainer(event.currentTarget);
        const nextTimelineGroupId = getTopVisibleTimelineGroupIdFromScrollContainer(event.currentTarget) as TimelineGroupId | null;
        setTopVisibleSelectionKey(nextSelectionKey);
        setTopVisibleTimelineGroupId(nextTimelineGroupId);
        syncViewportBucketIndexFromScrollContainer(event.currentTarget);
        markScrollActivity();
        handleScroll(event);
    }, [handleScroll, markScrollActivity, syncViewportBucketIndexFromScrollContainer]);

    return {
        topVisibleSelectionKey,
        setTopVisibleSelectionKey,
        viewportBucketIndex,
        handleLibraryScroll,
    };
}
