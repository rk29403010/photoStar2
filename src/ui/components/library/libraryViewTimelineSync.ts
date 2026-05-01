import { useCallback, useState, type UIEvent } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import { getTopVisibleSelectionKeyFromScrollContainer, getTopVisibleTimeSectionIdFromScrollContainer } from './libraryVisibleSelectionKey';
import { useViewportTimelineBucketIndex } from './libraryViewTimeline';
import { usePersistedState } from '@ui/hooks/usePersistedState';

export function useLibraryTimelineSync(params: {
    displayItems: LibrarySelectableItem[];
    timeline: LibraryTimelineSummary | null;
    activeTimelineSeek: GalleryTimelineSeek | null;
    markScrollActivity: () => void;
    handleScroll: (event: UIEvent<HTMLDivElement>) => void;
}) {
    const { activeTimelineSeek, displayItems, handleScroll, markScrollActivity, timeline } = params;
    const [topVisibleSelectionKey, setTopVisibleSelectionKeyState] = useState<string | null>(null);
    const [topVisibleSectionId, setTopVisibleSectionId] = useState<string | null>(null);
    const [restoreSelectionKey, setRestoreSelectionKey] = usePersistedState<string | null>('ps_library_top_visible_selection_key', null);
    const { viewportBucketIndex, syncViewportBucketIndexFromScrollContainer } = useViewportTimelineBucketIndex({
        displayItems,
        timeline,
        activeTimelineSeek,
        visibleSectionId: topVisibleSectionId,
    });
    const setTopVisibleSelectionKey = useCallback((selectionKey: string | null) => {
        setTopVisibleSelectionKeyState(selectionKey);
        setRestoreSelectionKey(selectionKey);
    }, [setRestoreSelectionKey]);

    const handleLibraryScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        setTopVisibleSelectionKey(getTopVisibleSelectionKeyFromScrollContainer(event.currentTarget));
        setTopVisibleSectionId(getTopVisibleTimeSectionIdFromScrollContainer(event.currentTarget));
        syncViewportBucketIndexFromScrollContainer(event.currentTarget);
        markScrollActivity();
        handleScroll(event);
    }, [handleScroll, markScrollActivity, setTopVisibleSectionId, setTopVisibleSelectionKey, syncViewportBucketIndexFromScrollContainer]);

    return {
        restoreSelectionKey,
        topVisibleSelectionKey,
        setTopVisibleSelectionKey,
        setTopVisibleSectionId,
        viewportBucketIndex,
        handleLibraryScroll,
    };
}
