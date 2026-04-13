import { useCallback, useEffect, useState, type UIEvent } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import { getTopVisibleSelectionKeyFromScrollContainer } from './libraryVisibleSelectionKey';
import { useViewportTimelineBucketIndex } from './libraryViewTimeline';

export function useLibraryTimelineSync(params: {
    displayItems: LibrarySelectableItem[];
    timeline: LibraryTimelineSummary | null;
    activeTimelineSeek: GalleryTimelineSeek | null;
    markScrollActivity: () => void;
    handleScroll: (event: UIEvent<HTMLDivElement>) => void;
}) {
    const { activeTimelineSeek, displayItems, handleScroll, markScrollActivity, timeline } = params;
    const [topVisibleSelectionKey, setTopVisibleSelectionKey] = useState<string | null>(null);
    const { viewportBucketIndex, updateViewportBucketIndex, syncViewportBucketIndexFromScrollContainer } = useViewportTimelineBucketIndex({
        displayItems,
        timeline,
        activeTimelineSeek,
        visibleSelectionKey: topVisibleSelectionKey,
    });

    const handleLibraryScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        setTopVisibleSelectionKey(getTopVisibleSelectionKeyFromScrollContainer(event.currentTarget));
        syncViewportBucketIndexFromScrollContainer(event.currentTarget);
        markScrollActivity();
        handleScroll(event);
    }, [handleScroll, markScrollActivity, syncViewportBucketIndexFromScrollContainer]);

    useEffect(() => {
        updateViewportBucketIndex(topVisibleSelectionKey);
    }, [topVisibleSelectionKey, updateViewportBucketIndex]);

    return {
        topVisibleSelectionKey,
        setTopVisibleSelectionKey,
        viewportBucketIndex,
        handleLibraryScroll,
    };
}
