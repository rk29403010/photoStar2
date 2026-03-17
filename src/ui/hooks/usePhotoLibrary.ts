import { useCallback, useMemo } from 'react';
import type { Asset } from '@contracts/core';
import type { DevRuntimeImpact } from '@contracts/devRuntime';
import type { PipelineStage } from '@contracts/jobs';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import { useJobManager } from './useJobManager';
import { usePhotoLibraryState } from './usePhotoLibrary.state';
import { usePhotoLibraryConnection } from '@boundary/runtime/usePhotoLibrary.connection';
import {
    createPipelineActions,
    createScanActions,
    createSettingsActions,
    createSystemActions,
    useLibraryTransport,
} from '@boundary/runtime/usePhotoLibrary.commands';
import { createAlbumActions, createBuildActions, createGroupActions } from '@boundary/runtime/usePhotoLibrary.actions';
import { writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';

export type { LibraryFilter } from '@contracts/usePhotoLibrary.types';

type PhotoLibraryState = ReturnType<typeof usePhotoLibraryState>;
type RequestFn = ReturnType<typeof useLibraryTransport>['request'];
type SendCommandFn = (command: string, payload?: Record<string, unknown>) => Promise<void>;
type RefreshLibraryOptions = {
    galleryOrder?: 'default' | 'previewed_first';
    preservePagingState?: boolean;
};

function getCurrentFilter(filterStackRef: PhotoLibraryState['filterStackRef']) {
    const stack = filterStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

function buildAssetRefreshPayload(
    filterStackRef: PhotoLibraryState['filterStackRef'],
    options: RefreshLibraryOptions,
) {
    return {
        limit: ASSET_PAGE_SIZE,
        offset: 0,
        filter: getCurrentFilter(filterStackRef),
        detailLevel: 'gallery' as const,
        galleryOrder: options.galleryOrder ?? 'default',
    };
}

function requestBackgroundAssetRefresh(request: RequestFn, payload: ReturnType<typeof buildAssetRefreshPayload>) {
    void request<void>({
        idPrefix: 'get_assets-preserve',
        command: 'get_assets',
        payload,
        timeoutMs: 10000,
        select: () => undefined,
    });
}

function useLibraryRefreshAction(params: {
    filterStackRef: PhotoLibraryState['filterStackRef'];
    request: RequestFn;
    sendCommand: SendCommandFn;
    setHasMoreAssets: PhotoLibraryState['setHasMoreAssets'];
    setIsLoadingMoreAssets: PhotoLibraryState['setIsLoadingMoreAssets'];
}) {
    const { filterStackRef, request, sendCommand, setHasMoreAssets, setIsLoadingMoreAssets } = params;

    return useCallback((options: RefreshLibraryOptions = {}) => {
        const payload = buildAssetRefreshPayload(filterStackRef, options);

        if (!options.preservePagingState) {
            setHasMoreAssets(true);
            setIsLoadingMoreAssets(false);
        }

        void sendCommand('get_stats');
        if (options.preservePagingState) {
            requestBackgroundAssetRefresh(request, payload);
            return;
        }

        void sendCommand('get_assets', payload);
    }, [filterStackRef, request, sendCommand, setHasMoreAssets, setIsLoadingMoreAssets]);
}

function useAssetLoadingActions(params: {
    assets: PhotoLibraryState['assets'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    hasMoreAssets: boolean;
    isLoadingMoreAssets: boolean;
    request: RequestFn;
    setAssets: PhotoLibraryState['setAssets'];
    setIsLoadingMoreAssets: PhotoLibraryState['setIsLoadingMoreAssets'];
}) {
    const {
        assets,
        filterStackRef,
        hasMoreAssets,
        isLoadingMoreAssets,
        request,
        setAssets,
        setIsLoadingMoreAssets,
    } = params;

    const loadMoreAssets = useCallback(async () => {
        if (isLoadingMoreAssets || !hasMoreAssets) {return;}

        setIsLoadingMoreAssets(true);
        try {
            await request<void>({
                idPrefix: `get_assets_page_${assets.length}`,
                command: 'get_assets',
                payload: {
                    limit: ASSET_PAGE_SIZE,
                    offset: assets.length,
                    filter: getCurrentFilter(filterStackRef),
                    detailLevel: 'gallery',
                },
                timeoutMs: 10000,
                select: () => undefined,
            });
        } finally {
            setIsLoadingMoreAssets(false);
        }
    }, [assets.length, filterStackRef, hasMoreAssets, isLoadingMoreAssets, request, setIsLoadingMoreAssets]);

    const loadAssetDetails = useCallback(async (assetId: string) => {
        const asset = await request<Asset>({
            idPrefix: `get_asset_detail_${assetId}`,
            command: 'get_asset_detail',
            payload: { assetId },
            timeoutMs: 10000,
            select: (data) => (data?.asset as Asset) || { id: assetId, original_path: '' },
        });

        setAssets((previousAssets) => previousAssets.map((existingAsset) => (
            existingAsset.id === assetId ? { ...existingAsset, ...asset } : existingAsset
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
    } = params;

    const refreshLibrary = useLibraryRefreshAction({
        filterStackRef,
        request,
        sendCommand,
        setHasMoreAssets,
        setIsLoadingMoreAssets,
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
    });

    return useMemo(() => ({
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        loadMoreAssets,
        loadAssetDetails,
    }), [loadAssetDetails, loadMoreAssets, refreshLibrary, refreshPeople, refreshSystemJobs]);
}

function useCoreActions(params: {
    transport: PhotoLibraryState['transport'];
    sendCommand: SendCommandFn;
    request: RequestFn;
    setAssets: PhotoLibraryState['setAssets'];
    setRejectedAssets: PhotoLibraryState['setRejectedAssets'];
    setFilterStack: PhotoLibraryState['setFilterStack'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
}) {
    const { transport, sendCommand, request, setAssets, setRejectedAssets, setFilterStack, filterStackRef, refreshLibrary } = params;

    const updateFilterStack = useCallback((newStack: LibraryFilter[]) => {
        setFilterStack(newStack);
        if (transport) {
            setAssets([]);
            refreshLibrary();
        }
    }, [refreshLibrary, setAssets, setFilterStack, transport]);

    const getRejectedAssetsForPerson = useCallback((personId: string | null) => {
        if (!personId) {
            setRejectedAssets([]);
            return;
        }

        void writeCommand(transport, `rejected-assets-${Date.now()}`, 'get_rejected_assets_for_person', { personId });
    }, [setRejectedAssets, transport]);

    const pushFilter = useCallback((filter: LibraryFilter) => {
        updateFilterStack([...filterStackRef.current, filter]);
    }, [filterStackRef, updateFilterStack]);

    const popFilter = useCallback(() => {
        const currentStack = filterStackRef.current;
        if (currentStack.length > 0) {
            updateFilterStack(currentStack.slice(0, -1));
        }
    }, [filterStackRef, updateFilterStack]);

    const clearFilters = useCallback(() => {
        updateFilterStack([]);
    }, [updateFilterStack]);

    return useMemo(() => ({
        prioritizeAsset: (mediaId: string) => sendCommand('prioritize_asset_processing', { mediaId }),
        renamePerson: (personId: string, newName: string) => sendCommand('rename_person', { personId, newName }),
        mergePeople: (personIds: string[], targetName: string) => sendCommand('merge_people', { personIds, targetName }),
        isolateFace: (assetId: string, faceIndex: number) => sendCommand('isolate_face', { assetId, faceIndex }),
        isolatePersonAsset: (assetId: string, personId: string) => sendCommand('isolate_person_asset', { assetId, personId }),
        getRejectedAssetsForPerson,
        updateAsset: (id: string, partial: Partial<Asset>) => setAssets((prev) => prev.map((asset) => asset.id === id ? { ...asset, ...partial } : asset)),
        getWorkflowVisualiser: (workflowId: string, runId?: string | null): Promise<WorkflowVisualiserModel> => request<WorkflowVisualiserModel>({
            idPrefix: `get_workflow_visualiser_${workflowId}_${runId === undefined ? 'default' : runId === null ? 'definition' : runId}`,
            command: 'get_workflow_visualiser',
            payload: runId === undefined ? { workflowId } : { workflowId, runId },
            timeoutMs: 10000,
            select: (data) => data as unknown as WorkflowVisualiserModel,
        }),
        getDevRuntimeImpact: (): Promise<DevRuntimeImpact> => request<DevRuntimeImpact>({
            idPrefix: 'get_dev_runtime_impact',
            command: 'get_dev_runtime_impact',
            timeoutMs: 10000,
            select: (data) => data as unknown as DevRuntimeImpact,
        }),
        pushFilter,
        popFilter,
        clearFilters,
    }), [clearFilters, getRejectedAssetsForPerson, popFilter, pushFilter, request, sendCommand, setAssets]);
}

function useScanWorkflowActions(params: {
    state: PhotoLibraryState;
    request: RequestFn;
    refreshLibrary: () => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
}) {
    const { state, request, refreshLibrary, refreshPeople, refreshSystemJobs } = params;

    return useMemo(() => createScanActions({
        transport: state.transport,
        addLog: state.addLog,
        addUiFeedEntry: state.addUiFeedEntry,
        lastScanId: state.lastScanId,
        activeWorkflowRunId: state.activeWorkflowRunId,
        workflowRefreshTimeout: state.workflowRefreshTimeout,
        setIngestStatusMessage: state.setIngestStatusMessage,
        request,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
    }), [
        state.addUiFeedEntry,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        request,
        state.activeWorkflowRunId,
        state.addLog,
        state.lastScanId,
        state.setIngestStatusMessage,
        state.transport,
        state.workflowRefreshTimeout,
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
        isSystemPaused: state.isSystemPaused,
        setStatus: state.setStatus,
        setAssets: state.setAssets,
        setPeople: state.setPeople,
        setStats: state.setStats,
        setSystemJobs: state.setSystemJobs,
        setQueueStatus: state.setQueueStatus,
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
        state.isSystemPaused,
        state.setAssets,
        state.setDataStats,
        state.setFolderHistory,
        state.setPeople,
        state.setQueueStatus,
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
    removeJob: (id: string) => void;
    sendCommand: SendCommandFn;
    request: RequestFn;
    refreshLibrary: () => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
}) {
    const { state, addJob, removeJob, sendCommand, request, refreshLibrary, refreshPeople, refreshSystemJobs } = params;

    const scanActions = useScanWorkflowActions({
        state,
        request,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
    });

    const pipelineActions = useMemo(() => createPipelineActions({ transport: state.transport, addJob }), [addJob, state.transport]);

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

    return useMemo(() => ({ ...scanActions, ...pipelineActions, ...systemActions, ...settingsActions }), [pipelineActions, scanActions, settingsActions, systemActions]);
}

function useComposedActions(state: PhotoLibraryState, addJob: (id: string, stage: PipelineStage, title: string) => void, removeJob: (id: string) => void, sendCommand: SendCommandFn, request: RequestFn) {
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
    });
    const workflowActions = useWorkflowActions({
        state,
        addJob,
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
    });
    const albumActions = useMemo(() => createAlbumActions({ request }), [request]);
    const groupActions = useMemo(() => createGroupActions({
        request,
        refreshLibrary: refreshActions.refreshLibrary,
        setAssets: state.setAssets,
    }), [refreshActions.refreshLibrary, request, state.setAssets]);
    const buildActions = useMemo(() => createBuildActions({ transport: state.transport, addJob }), [addJob, state.transport]);

    return useMemo(() => ({
        ...workflowActions,
        ...refreshActions,
        ...coreActions,
        ...albumActions,
        ...groupActions,
        ...buildActions,
    }), [albumActions, buildActions, coreActions, groupActions, refreshActions, workflowActions]);
}

export function usePhotoLibrary() {
    const state = usePhotoLibraryState();
    const { jobs, addJob, updateJobProgress, removeJob, processEvent } = useJobManager();
    const { sendCommand, request } = useLibraryTransport(state.transport, state.addLog);

    const connectionParams = useMemo(() => ({
        hasCompletedInitialSync: state.hasCompletedInitialSync,
        setHasCompletedInitialSync: state.setHasCompletedInitialSync,
        setHasMoreAssets: state.setHasMoreAssets,
        setIsLoadingMoreAssets: state.setIsLoadingMoreAssets,
        setStatus: state.setStatus,
        setError: state.setError,
        setTransport: state.setTransport,
        setStats: state.setStats,
        setAssets: state.setAssets,
        setPeople: state.setPeople,
        setSystemJobs: state.setSystemJobs,
        setQueueStatus: state.setQueueStatus,
        setDataStats: state.setDataStats,
        setRecentEvents: state.setRecentEvents,
        setWorkflowRuns: state.setWorkflowRuns,
        setFolderHistory: state.setFolderHistory,
        setRejectedAssets: state.setRejectedAssets,
        setIsSystemPaused: state.setIsSystemPaused,
        addUiFeedEntry: state.addUiFeedEntry,
        addNotification: state.addNotification,
        addLog: state.addLog,
        processEvent,
        updateJobProgress,
        filterStackRef: state.filterStackRef,
    }), [
        processEvent,
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
        state.setIsSystemPaused,
        state.setPeople,
        state.setQueueStatus,
        state.setRecentEvents,
        state.setWorkflowRuns,
        state.setRejectedAssets,
        state.setStats,
        state.setStatus,
        state.setSystemJobs,
        state.setTransport,
        updateJobProgress,
    ]);

    usePhotoLibraryConnection(connectionParams);

    const actions = useComposedActions(state, addJob, removeJob, sendCommand, request);

    return {
        status: state.status,
        error: state.error,
        logs: state.logs,
        hasCompletedInitialSync: state.hasCompletedInitialSync,
        hasMoreAssets: state.hasMoreAssets,
        isLoadingMoreAssets: state.isLoadingMoreAssets,
        isSystemPaused: state.isSystemPaused,
        stats: state.stats,
        assets: state.assets,
        people: state.people,
        rejectedAssets: state.rejectedAssets,
        jobs,
        systemJobs: state.systemJobs,
        queueStatus: state.queueStatus,
        dataStats: state.dataStats,
        recentEvents: state.recentEvents,
        workflowRuns: state.workflowRuns,
        folderHistory: state.folderHistory,
        uiFeedEntries: state.uiFeedEntries,
        ingestStatusMessage: state.ingestStatusMessage,
        actions,
        filterStack: state.filterStack,
        notifications: state.notifications,
        dismissNotification: state.dismissNotification,
    };
}
