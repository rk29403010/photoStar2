import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalleryTimelineSeek } from '@contracts/core';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';

export type TimelineJumpRequest = {
    groupId: string;
    groupIndex: number | null;
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

function useLatestTimelineJumpRefs(params: {
    loadedGroupIds: Set<string>;
}) {
    const loadedGroupIdsRef = useRef(params.loadedGroupIds);

    useEffect(() => {
        loadedGroupIdsRef.current = params.loadedGroupIds;
    }, [params.loadedGroupIds]);

    return { loadedGroupIdsRef };
}

export function useLibraryTimelineJump(params: {
    loadedGroupIds: Set<string>;
    loadingByGroupId: Partial<Record<string, boolean>>;
    onLoadTimelineGroupPage?: (groupId: string) => void;
    onRequestTimelineJumpTarget?: (groupId: string) => void;
    timelineGroupIndexById: Map<string, number>;
    layoutMode: GalleryLayoutMode;
    sortMode: LibrarySortMode;
    onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
}) {
    const {
        loadedGroupIds,
        loadingByGroupId,
        onLoadTimelineGroupPage,
        timelineGroupIndexById,
        layoutMode,
        sortMode,
        onGalleryTimelineSeek,
    } = params;
    const [timelineJumpRequest, setTimelineJumpRequest] = useState<TimelineJumpRequest | null>(null);
    const jumpNonceRef = useRef(0);
    const { loadedGroupIdsRef } = useLatestTimelineJumpRefs({
        loadedGroupIds,
    });

    const requestTimelineJump = useCallback((groupId: string, groupIndex: number | null) => {
        jumpNonceRef.current += 1;
        setTimelineJumpRequest({ groupId, groupIndex, nonce: jumpNonceRef.current });
    }, []);

    const jumpToTimelineGroup = useCallback((groupId: string | null, fallbackSeek: GalleryTimelineSeek | null) => {
        if (!canUseClientTimelineJump(layoutMode, sortMode)) {
            onGalleryTimelineSeek(fallbackSeek);
            return;
        }

        if (!groupId) {
            onGalleryTimelineSeek(fallbackSeek);
            return;
        }

        const groupIndex = timelineGroupIndexById.get(groupId) ?? null;

        if (groupIndex != null) {
            requestTimelineJump(groupId, groupIndex);
            return;
        }

        if (loadedGroupIdsRef.current.has(groupId)) {
            requestTimelineJump(groupId, groupIndex);
            return;
        }

        if (onLoadTimelineGroupPage) {
            if (!loadingByGroupId[groupId]) {
                onLoadTimelineGroupPage(groupId);
            }
            requestTimelineJump(groupId, groupIndex);
            return;
        }

        onGalleryTimelineSeek(fallbackSeek);
    }, [
        layoutMode,
        loadingByGroupId,
        loadedGroupIdsRef,
        onGalleryTimelineSeek,
        onLoadTimelineGroupPage,
        requestTimelineJump,
        sortMode,
        timelineGroupIndexById,
    ]);

    return {
        timelineJumpRequest,
        handleTimelineJump: useCallback((seek: GalleryTimelineSeek | null) => {
            const groupId = getTimelineSectionIdForSeek(seek);
            jumpToTimelineGroup(groupId, seek);
        }, [jumpToTimelineGroup]),
        jumpToTimelineGroup,
    };
}

export { getTimelineSectionIdForSeek };
