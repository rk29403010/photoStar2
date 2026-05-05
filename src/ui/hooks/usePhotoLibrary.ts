import { useCallback, useMemo } from 'react';
import type { Asset } from '@contracts/core';
import type { PipelineStage } from '@contracts/jobs';
import { useJobManager } from './useJobManager';
import { usePhotoLibraryState } from './usePhotoLibrary.state';
import { usePhotoLibraryConnection } from '@boundary/runtime/usePhotoLibrary.connection';
import {
    createTimelinePagingActions,
    createPhotoMetadataActions,
    createPipelineActions,
    createScanActions,
    createSettingsActions,
    createSystemActions,
    useLibraryTransport,
} from '@boundary/runtime/usePhotoLibrary.commands';
import { createAlbumActions, createBuildActions, createGroupActions, createTagActions } from '@boundary/runtime/usePhotoLibrary.actions';
import { createFaceSystemActions } from '@boundary/runtime/usePhotoLibrary.faceSystemActions';
import { createWorkflowRecoveryActions } from '@boundary/runtime/workflowRecoveryActions';
import {
    buildAssetRefreshPayload,
    buildLoadMoreAssetsPayload,
    requestBackgroundAssetRefresh,
    type RefreshLibraryOptions,
} from './usePhotoLibrary.gallery';
import { mergeAssetDetail } from './assetDetailMerge';
import { useAssetRefreshById } from './assetRefreshById';
import { applyAssetTagContext, fetchAssetTagContext } from './assetTagContext';
import { buildPhotoLibraryResult, useConnectionParams } from './usePhotoLibrary.composition';
import { useCoreActions } from './usePhotoLibrary.coreActions';

export type { LibraryFilter } from '@contracts/usePhotoLibrary.types';

type PhotoLibraryState = ReturnType<typeof usePhotoLibraryState>;
type RequestFn = ReturnType<typeof useLibraryTransport>['request'];
type SendCommandFn = (command: string, payload?: Record<string, unknown>) => Promise<void>;

function useLibraryRefreshAction(params: {
    assets: PhotoLibraryState['assets'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    request: RequestFn;
    sendCommand: SendCommandFn;
    setHasMoreAssets: PhotoLibraryState['setHasMoreAssets'];
    setIsLoadingMoreAssets: PhotoLibraryState['setIsLoadingMoreAssets'];
    setIsRefreshingLibrary: PhotoLibraryState['setIsRefreshingLibrary'];
    resetTimelineGallery: PhotoLibraryState['resetTimelineGallery'];
    groupSimilarPhotosRef: PhotoLibraryState['groupSimilarPhotosRef'];
    galleryDataModeRef: PhotoLibraryState['galleryDataModeRef'];
    galleryOrderRef: PhotoLibraryState['galleryOrderRef'];
    gallerySeekRef: PhotoLibraryState['gallerySeekRef'];
}) {
    const {
        assets,
        filterStackRef,
        request,
        sendCommand,
        setHasMoreAssets,
        setIsLoadingMoreAssets,
        setIsRefreshingLibrary,
        resetTimelineGallery,
        groupSimilarPhotosRef,
        galleryDataModeRef,
        galleryOrderRef,
        gallerySeekRef,
    } = params;

    return useCallback((options: RefreshLibraryOptions = {}) => {
        const payload = buildAssetRefreshPayload(groupSimilarPhotosRef, galleryDataModeRef, galleryOrderRef, gallerySeekRef, filterStackRef, {
            ...options,
            loadedAssetCount: options.preservePagingState ? assets.length : options.loadedAssetCount,
        });

        // `preservePagingState` refreshes still replace the visible asset page (via a background request),
        // so downstream UI should treat them as a refresh-in-flight to avoid "missing selection" recovery
        // from kicking users out of single-photo view mid-workflow.
        setIsRefreshingLibrary(true);

        if (!options.preservePagingState) {
            resetTimelineGallery();
            setHasMoreAssets(true);
            setIsLoadingMoreAssets(false);
        }

        void sendCommand('get_stats');
        if (options.preservePagingState) {
            requestBackgroundAssetRefresh(request, payload);
            return;
        }

        void sendCommand('get_assets', payload);
    }, [assets.length, filterStackRef, galleryDataModeRef, galleryOrderRef, gallerySeekRef, groupSimilarPhotosRef, request, resetTimelineGallery, sendCommand, setHasMoreAssets, setIsLoadingMoreAssets, setIsRefreshingLibrary]);
}

function useAssetLoadingActions(params: {
    assets: PhotoLibraryState['assets'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    hasMoreAssets: boolean;
    isLoadingMoreAssets: boolean;
    request: RequestFn;
    setAssets: PhotoLibraryState['setAssets'];
    setIsLoadingMoreAssets: PhotoLibraryState['setIsLoadingMoreAssets'];
    groupSimilarPhotosRef: PhotoLibraryState['groupSimilarPhotosRef'];
    galleryDataModeRef: PhotoLibraryState['galleryDataModeRef'];
    galleryOrderRef: PhotoLibraryState['galleryOrderRef'];
    gallerySeekRef: PhotoLibraryState['gallerySeekRef'];
}) {
    const {
        assets,
        filterStackRef,
        hasMoreAssets,
        isLoadingMoreAssets,
        request,
        setAssets,
        setIsLoadingMoreAssets,
        groupSimilarPhotosRef,
        galleryDataModeRef,
        galleryOrderRef,
        gallerySeekRef,
    } = params;

    const loadMoreAssets = useCallback(async () => {
        if (isLoadingMoreAssets || !hasMoreAssets) {return;}

        setIsLoadingMoreAssets(true);
        try {
            await request<void>({
                idPrefix: `get_assets_page_${assets.length}`,
                command: 'get_assets',
                payload: buildLoadMoreAssetsPayload({
                    assetCount: assets.length,
                    filterStackRef,
                    groupSimilarPhotosRef,
                    galleryDataModeRef,
                    galleryOrderRef,
                    gallerySeekRef,
                }),
                timeoutMs: 10000,
                select: () => undefined,
            });
        } finally {
            setIsLoadingMoreAssets(false);
        }
    }, [assets.length, filterStackRef, galleryDataModeRef, galleryOrderRef, gallerySeekRef, groupSimilarPhotosRef, hasMoreAssets, isLoadingMoreAssets, request, setIsLoadingMoreAssets]);

    const loadAssetDetails = useCallback(async (
        assetId: string,
        options: { includeEvidence?: boolean } = {},
    ) => {
        const asset = await request<Asset>({
            idPrefix: `get_asset_detail_${assetId}`,
            command: 'get_asset_detail',
            payload: { assetId, includeEvidence: options.includeEvidence === true },
            timeoutMs: 10000,
            select: (data) => (data?.asset as Asset) || { id: assetId, original_path: '' },
        });
        const tagContext = await fetchAssetTagContext(request, assetId);
        const assetWithTagContext = applyAssetTagContext(asset, tagContext);

        setAssets((previousAssets) => previousAssets.map((existingAsset) => (
            existingAsset.id === assetId ? mergeAssetDetail(existingAsset, assetWithTagContext) : existingAsset
        )));
    }, [request, setAssets]);

    return { loadMoreAssets, loadAssetDetails };
}

function useRefreshActions(params: {
    assets: PhotoLibraryState['assets'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    hasMoreAssets: boolean;
    isLoadingMoreAssets: boolean;
    request: RequestFn;
    sendCommand: SendCommandFn;
    setAssets: PhotoLibraryState['setAssets'];
    setHasMoreAssets: PhotoLibraryState['setHasMoreAssets'];
    setIsLoadingMoreAssets: PhotoLibraryState['setIsLoadingMoreAssets'];
    setIsRefreshingLibrary: PhotoLibraryState['setIsRefreshingLibrary'];
    resetTimelineGallery: PhotoLibraryState['resetTimelineGallery'];
    groupSimilarPhotosRef: PhotoLibraryState['groupSimilarPhotosRef'];
    galleryDataModeRef: PhotoLibraryState['galleryDataModeRef'];
    galleryOrderRef: PhotoLibraryState['galleryOrderRef'];
    gallerySeekRef: PhotoLibraryState['gallerySeekRef'];
}) {
    const {
        assets,
        filterStackRef,
        hasMoreAssets,
        isLoadingMoreAssets,
        request,
        sendCommand,
        setAssets,
        setHasMoreAssets,
        setIsLoadingMoreAssets,
        setIsRefreshingLibrary,
        resetTimelineGallery,
        groupSimilarPhotosRef,
        galleryDataModeRef,
        galleryOrderRef,
        gallerySeekRef,
    } = params;

    const refreshLibrary = useLibraryRefreshAction({
        assets,
        filterStackRef,
        request,
        sendCommand,
        setHasMoreAssets,
        setIsLoadingMoreAssets,
        setIsRefreshingLibrary,
        resetTimelineGallery,
        groupSimilarPhotosRef,
        galleryDataModeRef,
        galleryOrderRef,
        gallerySeekRef,
    });

    const refreshPeople = useCallback(() => {
        void sendCommand('get_people');
    }, [sendCommand]);

    const refreshSystemJobs = useCallback(() => {
        void sendCommand('get_system_jobs');
    }, [sendCommand]);

    const { loadMoreAssets, loadAssetDetails } = useAssetLoadingActions({
        assets,
        filterStackRef,
        hasMoreAssets,
        isLoadingMoreAssets,
        request,
        setAssets,
        setIsLoadingMoreAssets,
        groupSimilarPhotosRef,
        galleryDataModeRef,
        galleryOrderRef,
        gallerySeekRef,
    });

    return useMemo(() => ({
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        loadMoreAssets,
        loadAssetDetails,
    }), [loadAssetDetails, loadMoreAssets, refreshLibrary, refreshPeople, refreshSystemJobs]);
}

function useScanWorkflowActions(params: {
    state: PhotoLibraryState;
    request: RequestFn;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: 'queued' | 'starting' | 'running' | 'paused' | 'retrying' | 'completed' | 'failed' | 'cancelled' | 'idle') => void;
    updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        stages?: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
    }) => void;
    refreshLibrary: () => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
}) {
    const { state, request, addJob, updateJobState, updateJobProgress, refreshLibrary, refreshPeople, refreshSystemJobs } = params;

    return useMemo(() => createScanActions({
        transport: state.transport,
        addJob,
        updateJobState,
        updateJobProgress,
        addNotification: state.addNotification,
        addLog: state.addLog,
        lastScanId: state.lastScanId,
        request,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
    }), [
        addJob,
        state.addNotification,
        updateJobProgress,
        updateJobState,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        request,
        state.addLog,
        state.lastScanId,
        state.transport,
    ]);
}

function useSystemWorkflowActions(params: {
    state: PhotoLibraryState;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    removeJob: (id: string) => void;
    sendCommand: SendCommandFn;
    request: RequestFn;
    refreshLibrary: () => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
}) {
    const { state, addJob, removeJob, sendCommand, request, refreshLibrary, refreshPeople, refreshSystemJobs } = params;

    return useMemo(() => createSystemActions({
        transport: state.transport,
        addJob,
        removeJob,
        sendCommand,
        request,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        setStatus: state.setStatus,
        setAssets: state.setAssets,
        setPeople: state.setPeople,
        setStats: state.setStats,
        setSystemJobs: state.setSystemJobs,
        setWorkflowStatus: state.setWorkflowStatus,
        setDataStats: state.setDataStats,
        setRecentEvents: state.setRecentEvents,
        setWorkflowRuns: state.setWorkflowRuns,
        setFolderHistory: state.setFolderHistory,
        setRejectedAssets: state.setRejectedAssets,
    }), [
        addJob,
        removeJob,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        request,
        sendCommand,
        state.setAssets,
        state.setDataStats,
        state.setFolderHistory,
        state.setPeople,
        state.setWorkflowStatus,
        state.setRecentEvents,
        state.setRejectedAssets,
        state.setStats,
        state.setStatus,
        state.transport,
        state.setSystemJobs,
        state.setWorkflowRuns,
    ]);
}

function useWorkflowActions(params: {
    state: PhotoLibraryState;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: 'queued' | 'starting' | 'running' | 'paused' | 'retrying' | 'completed' | 'failed' | 'cancelled' | 'idle') => void;
    updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        stages?: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
    }) => void;
    removeJob: (id: string) => void;
    sendCommand: SendCommandFn;
    request: RequestFn;
    refreshLibrary: () => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
}) {
    const { state, addJob, updateJobState, updateJobProgress, removeJob, sendCommand, request, refreshLibrary, refreshPeople, refreshSystemJobs } = params;

    const scanActions = useScanWorkflowActions({
        state,
        request,
        addJob,
        updateJobState,
        updateJobProgress,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
    });

    const pipelineActions = useMemo(() => createPipelineActions({
        request,
        addJob,
        updateJobState,
        updateJobProgress,
        addNotification: state.addNotification,
        refreshLibrary,
        refreshSystemJobs,
    }), [addJob, refreshLibrary, refreshSystemJobs, request, state.addNotification, updateJobProgress, updateJobState]);

    const systemActions = useSystemWorkflowActions({
        state,
        addJob,
        removeJob,
        sendCommand,
        request,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
    });

    const settingsActions = useMemo(() => createSettingsActions({
        transport: state.transport,
        request,
        setAssets: state.setAssets,
    }), [request, state.setAssets, state.transport]);
    const recoveryActions = useMemo(() => createWorkflowRecoveryActions({ request }), [request]);

    return useMemo(() => ({ ...scanActions, ...pipelineActions, ...systemActions, ...settingsActions, ...recoveryActions }), [pipelineActions, recoveryActions, scanActions, settingsActions, systemActions]);
}

function useSupplementaryActions(params: {
    state: PhotoLibraryState;
    request: RequestFn;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: 'queued' | 'starting' | 'running' | 'paused' | 'retrying' | 'completed' | 'failed' | 'cancelled' | 'idle') => void;
    sendCommand: SendCommandFn;
    refreshActions: ReturnType<typeof useRefreshActions>;
}) {
    const { state, request, addJob, updateJobState, sendCommand, refreshActions } = params;

    const albumActions = useMemo(() => createAlbumActions({ request }), [request]);
    const photoMetadataActions = useMemo(() => createPhotoMetadataActions({ request }), [request]);
    const groupActions = useMemo(() => createGroupActions({
        request,
        refreshLibrary: refreshActions.refreshLibrary,
        setAssets: state.setAssets,
    }), [refreshActions.refreshLibrary, request, state.setAssets]);
    const tagActions = useMemo(() => createTagActions({
        request,
        setAssets: state.setAssets,
        refreshLibrary: refreshActions.refreshLibrary,
    }), [refreshActions.refreshLibrary, request, state.setAssets]);
    const buildActions = useMemo(() => createBuildActions({
        transport: state.transport,
        request,
        addJob,
        updateJobState,
        refreshLibrary: refreshActions.refreshLibrary,
        refreshSystemJobs: refreshActions.refreshSystemJobs,
        loadAssetDetails: refreshActions.loadAssetDetails,
    }), [addJob, refreshActions.loadAssetDetails, refreshActions.refreshLibrary, refreshActions.refreshSystemJobs, request, state.transport, updateJobState]);
    const faceSystemActions = useMemo(() => createFaceSystemActions({
        addJob,
        request,
        updateJobState,
        sendCommand,
        setStatus: state.setStatus,
        setPeople: state.setPeople,
        refreshLibrary: refreshActions.refreshLibrary,
        refreshPeople: refreshActions.refreshPeople,
        refreshSystemJobs: refreshActions.refreshSystemJobs,
    }), [addJob, refreshActions.refreshLibrary, refreshActions.refreshPeople, refreshActions.refreshSystemJobs, request, sendCommand, state.setPeople, state.setStatus, updateJobState]);

    return {
        albumActions,
        photoMetadataActions,
        groupActions,
        tagActions,
        buildActions,
        faceSystemActions,
    };
}

function useTimelinePagingActions(
    sendCommand: SendCommandFn,
    state: PhotoLibraryState,
) {
    return useMemo(() => createTimelinePagingActions(
        sendCommand,
        state.filterStackRef,
        state.galleryOrderRef,
        {
            setTimelineGroupLoading: state.setTimelineGroupLoading,
            setTimelineActiveJumpTarget: state.setTimelineActiveJumpTarget,
        },
    ), [sendCommand, state.filterStackRef, state.galleryOrderRef, state.setTimelineActiveJumpTarget, state.setTimelineGroupLoading]);
}

function useComposedActions(
    state: PhotoLibraryState,
    addJob: (id: string, stage: PipelineStage, title: string) => void,
    updateJobState: (id: string, state: 'queued' | 'starting' | 'running' | 'paused' | 'retrying' | 'completed' | 'failed' | 'cancelled' | 'idle') => void,
    updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        stages?: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
    }) => void,
    removeJob: (id: string) => void,
    sendCommand: SendCommandFn,
    request: RequestFn,
) {
    const refreshActions = useRefreshActions({
        assets: state.assets,
        filterStackRef: state.filterStackRef,
        hasMoreAssets: state.hasMoreAssets,
        isLoadingMoreAssets: state.isLoadingMoreAssets,
        request,
        sendCommand,
        setAssets: state.setAssets,
        setHasMoreAssets: state.setHasMoreAssets,
        setIsLoadingMoreAssets: state.setIsLoadingMoreAssets,
        setIsRefreshingLibrary: state.setIsRefreshingLibrary,
        resetTimelineGallery: state.resetTimelineGallery,
        groupSimilarPhotosRef: state.groupSimilarPhotosRef,
        galleryDataModeRef: state.galleryDataModeRef,
        galleryOrderRef: state.galleryOrderRef,
        gallerySeekRef: state.gallerySeekRef,
    });
    const workflowActions = useWorkflowActions({
        state,
        addJob,
        updateJobState,
        updateJobProgress,
        removeJob,
        sendCommand,
        request,
        refreshLibrary: refreshActions.refreshLibrary,
        refreshPeople: refreshActions.refreshPeople,
        refreshSystemJobs: refreshActions.refreshSystemJobs,
    });
    const coreActions = useCoreActions({
        transport: state.transport,
        sendCommand,
        request,
        setAssets: state.setAssets,
        setRejectedAssets: state.setRejectedAssets,
        setFilterStack: state.setFilterStack,
        filterStackRef: state.filterStackRef,
        refreshLibrary: refreshActions.refreshLibrary,
        groupSimilarPhotosRef: state.groupSimilarPhotosRef,
        galleryDataModeRef: state.galleryDataModeRef,
        galleryOrderRef: state.galleryOrderRef,
        gallerySeekRef: state.gallerySeekRef,
        setIsSeekingTimeline: state.setIsSeekingTimeline,
        setGalleryTimelineSeek: state.setGalleryTimelineSeek,
    });
    const timelinePagingActions = useTimelinePagingActions(sendCommand, state);
    const supplementaryActions = useSupplementaryActions({
        state,
        request,
        addJob,
        updateJobState,
        sendCommand,
        refreshActions,
    });

    return useMemo(() => ({
        ...workflowActions,
        ...refreshActions,
        ...coreActions,
        ...timelinePagingActions,
        setTimelineVisibleGroup: state.setTimelineVisibleGroup,
        ...supplementaryActions.albumActions,
        ...supplementaryActions.photoMetadataActions,
        ...supplementaryActions.groupActions,
        ...supplementaryActions.tagActions,
        ...supplementaryActions.buildActions,
        ...supplementaryActions.faceSystemActions,
    }), [coreActions, refreshActions, state.setTimelineVisibleGroup, supplementaryActions, timelinePagingActions, workflowActions]);
}

export function usePhotoLibrary() {
    const state = usePhotoLibraryState();
    const { jobs, addJob, updateJobState, updateJobProgress, removeJob, processEvent } = useJobManager();
    const { sendCommand, request } = useLibraryTransport(state.transport, state.addLog);
    const refreshAssetById = useAssetRefreshById({ request, setAssets: state.setAssets });

    const connectionParams = useConnectionParams(state, { processEvent, updateJobProgress }, refreshAssetById);

    usePhotoLibraryConnection(connectionParams);

    const actions = useComposedActions(state, addJob, updateJobState, updateJobProgress, removeJob, sendCommand, request);

    return buildPhotoLibraryResult({ state, jobs, actions });
}
