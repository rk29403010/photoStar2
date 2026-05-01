import { useEffect, useRef, type MutableRefObject } from 'react';
import type { GalleryTimelineSeek } from '@contracts/core';

function getTimelineSeekKey(galleryTimelineSeek: GalleryTimelineSeek | null) {
    if (!galleryTimelineSeek) {
        return null;
    }

    return galleryTimelineSeek.kind === 'dated'
        ? `dated:${galleryTimelineSeek.targetDate}`
        : galleryTimelineSeek.kind;
}

export function useTimelineSeekScrollReset(
    scrollRef: MutableRefObject<HTMLDivElement | null>,
    galleryTimelineSeek: GalleryTimelineSeek | null,
    isSeekingTimeline: boolean,
) {
    const previousSeekKeyRef = useRef<string | null>(null);
    const previousIsSeekingRef = useRef(false);

    useEffect(() => {
        const currentSeekKey = getTimelineSeekKey(galleryTimelineSeek);
        const seekChanged = currentSeekKey !== previousSeekKeyRef.current;
        const startedSeeking = isSeekingTimeline && !previousIsSeekingRef.current;

        if (currentSeekKey && (seekChanged || startedSeeking)) {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        }

        previousSeekKeyRef.current = currentSeekKey;
        previousIsSeekingRef.current = isSeekingTimeline;
    }, [galleryTimelineSeek, isSeekingTimeline, scrollRef]);
}
