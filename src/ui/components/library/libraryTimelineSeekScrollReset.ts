import { useEffect, type MutableRefObject } from 'react';
import type { GalleryTimelineSeek } from '@contracts/core';

export function useTimelineSeekScrollReset(
    scrollRef: MutableRefObject<HTMLDivElement | null>,
    galleryTimelineSeek: GalleryTimelineSeek | null,
    isSeekingTimeline: boolean,
) {
    useEffect(() => {
        if (!galleryTimelineSeek && !isSeekingTimeline) {
            return;
        }
        scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }, [galleryTimelineSeek, isSeekingTimeline, scrollRef]);
}
