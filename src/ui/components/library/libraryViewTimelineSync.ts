import { useCallback, useState, type UIEvent } from 'react';
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
    const { viewportBucketIndex, syncViewportBucketIndexFromScrollContainer } = useViewportTimelineBucketIndex({
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

    return {
        topVisibleSelectionKey,
        setTopVisibleSelectionKey,
        viewportBucketIndex,
        handleLibraryScroll,
    };
}
