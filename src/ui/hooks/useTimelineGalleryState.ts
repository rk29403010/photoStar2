import { useCallback, useMemo, useState } from 'react';
import type { TimelineGalleryPage, TimelineGroupId, TimelineGroupSummary, TimelineJumpTarget } from '@contracts/core';

export type TimelineGalleryStateSlice = {
    groupSummaries: TimelineGroupSummary[];
    loadedPagesByGroupId: Partial<Record<TimelineGroupId, TimelineGalleryPage>>;
    loadingByGroupId: Partial<Record<TimelineGroupId, boolean>>;
    activeJumpTarget: TimelineJumpTarget | null;
    visibleGroupId: TimelineGroupId | null;
    visibleGroupIndex: number | null;
}

function applyLoadedStateToGroupSummaries(
    groupSummaries: TimelineGroupSummary[],
    loadedPagesByGroupId: Partial<Record<TimelineGroupId, TimelineGalleryPage>>,
) {
    return groupSummaries.map((groupSummary) => (
        loadedPagesByGroupId[groupSummary.id]
            ? { ...groupSummary, isLoaded: true }
            : groupSummary
    ));
}

export function useTimelineGalleryState() {
    const [groupSummaries, setGroupSummariesState] = useState<TimelineGroupSummary[]>([]);
    const [loadedPagesByGroupId, setLoadedPagesByGroupId] = useState<Partial<Record<TimelineGroupId, TimelineGalleryPage>>>({});
    const [loadingByGroupId, setLoadingByGroupId] = useState<Partial<Record<TimelineGroupId, boolean>>>({});
    const [activeJumpTarget, setTimelineActiveJumpTarget] = useState<TimelineJumpTarget | null>(null);
    const [visibleGroupId, setVisibleGroupId] = useState<TimelineGroupId | null>(null);
    const [visibleGroupIndex, setVisibleGroupIndex] = useState<number | null>(null);

    const setTimelineGroupSummaries = useCallback((nextGroupSummaries: TimelineGroupSummary[]) => {
        setGroupSummariesState(applyLoadedStateToGroupSummaries(nextGroupSummaries, loadedPagesByGroupId));
    }, [loadedPagesByGroupId]);

    const upsertTimelineGroupPage = useCallback((page: TimelineGalleryPage) => {
        setLoadedPagesByGroupId((previousPagesByGroupId) => ({
            ...previousPagesByGroupId,
            [page.groupId]: page,
        }));
        setLoadingByGroupId((previousLoadingByGroupId) => ({
            ...previousLoadingByGroupId,
            [page.groupId]: false,
        }));
        setGroupSummariesState((previousGroupSummaries) => previousGroupSummaries.map((groupSummary) => (
            groupSummary.id === page.groupId
                ? { ...groupSummary, isLoaded: true }
                : groupSummary
        )));
    }, []);

    const setTimelineGroupLoading = useCallback((groupId: TimelineGroupId, isLoading: boolean) => {
        setLoadingByGroupId((previousLoadingByGroupId) => ({
            ...previousLoadingByGroupId,
            [groupId]: isLoading,
        }));
    }, []);

    const setTimelineVisibleGroup = useCallback((groupId: TimelineGroupId | null, groupIndex: number | null) => {
        setVisibleGroupId((previousGroupId) => previousGroupId === groupId ? previousGroupId : groupId);
        setVisibleGroupIndex((previousGroupIndex) => previousGroupIndex === groupIndex ? previousGroupIndex : groupIndex);
    }, []);

    const resetTimelineGallery = useCallback(() => {
        setGroupSummariesState([]);
        setLoadedPagesByGroupId({});
        setLoadingByGroupId({});
        setTimelineActiveJumpTarget(null);
        setVisibleGroupId(null);
        setVisibleGroupIndex(null);
    }, []);

    const timelineGallery = useMemo<TimelineGalleryStateSlice>(() => ({
        groupSummaries,
        loadedPagesByGroupId,
        loadingByGroupId,
        activeJumpTarget,
        visibleGroupId,
        visibleGroupIndex,
    }), [activeJumpTarget, groupSummaries, loadedPagesByGroupId, loadingByGroupId, visibleGroupId, visibleGroupIndex]);

    return {
        timelineGallery,
        setTimelineGroupSummaries,
        upsertTimelineGroupPage,
        setTimelineGroupLoading,
        setTimelineActiveJumpTarget,
        setTimelineVisibleGroup,
        resetTimelineGallery,
    };
}
