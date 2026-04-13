import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalleryTimelineSeek } from '@contracts/core';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';

export type TimelineJumpRequest = {
    sectionId: string;
    nonce: number;
};

function getTimelineSectionIdForSeek(seek: GalleryTimelineSeek | null) {
    if (!seek || seek.kind !== 'dated') {
        return null;
    }

    const year = new Date(seek.targetDate).getUTCFullYear();
    if (Number.isNaN(year)) {
        return null;
    }

    return `decade-${Math.floor(year / 10) * 10}`;
}

function canUseClientTimelineJump(layoutMode: GalleryLayoutMode, sortMode: LibrarySortMode) {
    return layoutMode === 'justified' && (sortMode === 'date' || sortMode === 'reverse-date');
}

export function useLibraryTimelineJump(params: {
    hasMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
    loadedSectionIds: Set<string>;
    layoutMode: GalleryLayoutMode;
    sortMode: LibrarySortMode;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
}) {
    const { hasMoreAssets, onLoadMoreAssets, loadedSectionIds, layoutMode, sortMode, onGalleryTimelineSeek } = params;
    const [timelineJumpRequest, setTimelineJumpRequest] = useState<TimelineJumpRequest | null>(null);
    const hasMoreAssetsRef = useRef(Boolean(hasMoreAssets));
    const onLoadMoreAssetsRef = useRef(onLoadMoreAssets);
    const loadedSectionIdsRef = useRef(loadedSectionIds);
    const jumpNonceRef = useRef(0);

    useEffect(() => {
        hasMoreAssetsRef.current = Boolean(hasMoreAssets);
    }, [hasMoreAssets]);

    useEffect(() => {
        onLoadMoreAssetsRef.current = onLoadMoreAssets;
    }, [onLoadMoreAssets]);

    useEffect(() => {
        loadedSectionIdsRef.current = loadedSectionIds;
    }, [loadedSectionIds]);

    const requestTimelineJump = useCallback((sectionId: string) => {
        jumpNonceRef.current += 1;
        setTimelineJumpRequest({ sectionId, nonce: jumpNonceRef.current });
    }, []);

    return {
        timelineJumpRequest,
        handleTimelineJump: useCallback((seek: GalleryTimelineSeek | null) => {
            if (!canUseClientTimelineJump(layoutMode, sortMode)) {
                onGalleryTimelineSeek(seek);
                return;
            }

            const sectionId = getTimelineSectionIdForSeek(seek);
            if (!sectionId) {
                onGalleryTimelineSeek(seek);
                return;
            }

            if (loadedSectionIdsRef.current.has(sectionId)) {
                requestTimelineJump(sectionId);
                return;
            }

            if (!hasMoreAssetsRef.current || !onLoadMoreAssetsRef.current) {
                onGalleryTimelineSeek(seek);
                return;
            }

            void (async () => {
                while (hasMoreAssetsRef.current && onLoadMoreAssetsRef.current) {
                    await onLoadMoreAssetsRef.current();
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                    if (loadedSectionIdsRef.current.has(sectionId)) {
                        requestTimelineJump(sectionId);
                        return;
                    }
                }

                onGalleryTimelineSeek(seek);
            })();
        }, [layoutMode, onGalleryTimelineSeek, requestTimelineJump, sortMode]),
    };
}

export { getTimelineSectionIdForSeek };
