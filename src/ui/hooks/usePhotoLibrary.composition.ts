import { useMemo } from 'react';
import type { useJobManager } from './useJobManager';
import type { usePhotoLibraryState } from './usePhotoLibrary.state';

type PhotoLibraryState = ReturnType<typeof usePhotoLibraryState>;
type JobManagerState = ReturnType<typeof useJobManager>;

export function useConnectionParams(
    state: PhotoLibraryState,
    jobManager: Pick<JobManagerState, 'processEvent' | 'updateJobProgress'>,
    refreshAssetById?: (assetId: string) => void,
) {
    return useMemo(() => ({
        hasCompletedInitialSync: state.hasCompletedInitialSync,
        setHasCompletedInitialSync: state.setHasCompletedInitialSync,
        setHasMoreAssets: state.setHasMoreAssets,
        setIsLoadingMoreAssets: state.setIsLoadingMoreAssets,
        setIsRefreshingLibrary: state.setIsRefreshingLibrary,
        setIsSeekingTimeline: state.setIsSeekingTimeline,
        setTimelineGroupSummaries: state.setTimelineGroupSummaries,
        upsertTimelineGroupPage: state.upsertTimelineGroupPage,
        setTimelineGroupLoading: state.setTimelineGroupLoading,
        setTimelineActiveJumpTarget: state.setTimelineActiveJumpTarget,
        setStatus: state.setStatus,
        setError: state.setError,
        setTransport: state.setTransport,
        setStats: state.setStats,
        setAssets: state.setAssets,
        setPeople: state.setPeople,
        setSystemJobs: state.setSystemJobs,
        setWorkflowStatus: state.setWorkflowStatus,
        setDataStats: state.setDataStats,
        setRecentEvents: state.setRecentEvents,
        setWorkflowRuns: state.setWorkflowRuns,
        setFolderHistory: state.setFolderHistory,
        setRejectedAssets: state.setRejectedAssets,
        addUiFeedEntry: state.addUiFeedEntry,
        addNotification: state.addNotification,
        addLog: state.addLog,
        processEvent: jobManager.processEvent,
        updateJobProgress: jobManager.updateJobProgress,
        refreshAssetById,
        filterStackRef: state.filterStackRef,
        groupSimilarPhotosRef: state.groupSimilarPhotosRef,
        galleryDataModeRef: state.galleryDataModeRef,
        galleryOrderRef: state.galleryOrderRef,
        gallerySeekRef: state.gallerySeekRef,
    }), [
        jobManager.processEvent,
        state.addLog,
        state.addUiFeedEntry,
        state.addNotification,
        state.filterStackRef,
        state.hasCompletedInitialSync,
        state.setAssets,
        state.setDataStats,
        state.setError,
        state.setFolderHistory,
        state.setHasCompletedInitialSync,
        state.setHasMoreAssets,
        state.setIsLoadingMoreAssets,
        state.setIsRefreshingLibrary,
        state.setIsSeekingTimeline,
        state.setTimelineActiveJumpTarget,
        state.setTimelineGroupLoading,
        state.setTimelineGroupSummaries,
        state.upsertTimelineGroupPage,
        state.setPeople,
        state.setRejectedAssets,
        state.setRecentEvents,
        state.setStats,
        state.setStatus,
        state.setSystemJobs,
        state.setTransport,
        state.setWorkflowRuns,
        state.setWorkflowStatus,
        state.galleryDataModeRef,
        state.galleryOrderRef,
        state.gallerySeekRef,
        state.groupSimilarPhotosRef,
        jobManager.updateJobProgress,
        refreshAssetById,
    ]);
}

export function buildPhotoLibraryResult<TActions>(params: {
    state: PhotoLibraryState;
    jobs: JobManagerState['jobs'];
    actions: TActions;
}) {
    const { state, jobs, actions } = params;

    return {
        status: state.status,
        error: state.error,
        logs: state.logs,
        hasCompletedInitialSync: state.hasCompletedInitialSync,
        hasMoreAssets: state.hasMoreAssets,
        isLoadingMoreAssets: state.isLoadingMoreAssets,
        isRefreshingLibrary: state.isRefreshingLibrary,
        stats: state.stats,
        timelineGallery: state.timelineGallery,
        galleryTimelineSeek: state.galleryTimelineSeek,
        isSeekingTimeline: state.isSeekingTimeline,
        assets: state.assets,
        people: state.people,
        rejectedAssets: state.rejectedAssets,
        jobs,
        systemJobs: state.systemJobs,
        workflowStatus: state.workflowStatus,
        dataStats: state.dataStats,
        recentEvents: state.recentEvents,
        workflowRuns: state.workflowRuns,
        folderHistory: state.folderHistory,
        uiFeedEntries: state.uiFeedEntries,
        actions,
        filterStack: state.filterStack,
        notifications: state.notifications,
        dismissNotification: state.dismissNotification,
    };
}
