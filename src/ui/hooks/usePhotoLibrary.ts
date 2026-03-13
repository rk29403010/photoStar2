import { useCallback, useMemo } from 'react';
import type { Asset } from '@contracts/core';
import type { PipelineStage } from '@contracts/jobs';
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

function getCurrentFilter(filterStackRef: PhotoLibraryState['filterStackRef']) {
    const stack = filterStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
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

    const refreshLibrary = useCallback(() => {
        setHasMoreAssets(true);
        setIsLoadingMoreAssets(false);
        void sendCommand('get_stats');
        void sendCommand('get_assets', {
            limit: ASSET_PAGE_SIZE,
            offset: 0,
            filter: getCurrentFilter(filterStackRef),
            detailLevel: 'gallery',
        });
    }, [filterStackRef, sendCommand, setHasMoreAssets, setIsLoadingMoreAssets]);

    const refreshPeople = useCallback(() => {
        void sendCommand('get_people');
    }, [sendCommand]);

    const refreshSystemJobs = useCallback(() => {
        void sendCommand('get_system_jobs');
    }, [sendCommand]);

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
    setAssets: PhotoLibraryState['setAssets'];
    setRejectedAssets: PhotoLibraryState['setRejectedAssets'];
    setFilterStack: PhotoLibraryState['setFilterStack'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    refreshLibrary: () => void;
}) {
    const { transport, sendCommand, setAssets, setRejectedAssets, setFilterStack, filterStackRef, refreshLibrary } = params;

    const updateFilterStack = useCallback((newStack: LibraryFilter[]) => {
        setFilterStack(newStack);
        if (transport) {
            refreshLibrary();
        }
    }, [refreshLibrary, setFilterStack, transport]);

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
        pushFilter,
        popFilter,
        clearFilters,
    }), [clearFilters, getRejectedAssetsForPerson, popFilter, pushFilter, sendCommand, setAssets]);
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

    const scanActions = useMemo(() => createScanActions({
        transport: state.transport,
        addLog: state.addLog,
        lastScanId: state.lastScanId,
    }), [state.addLog, state.lastScanId, state.transport]);

    const pipelineActions = useMemo(() => createPipelineActions({ transport: state.transport, addJob }), [addJob, state.transport]);

    const systemActions = useMemo(() => createSystemActions({
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
        state.setPeople,
        state.setStats,
        state.setStatus,
        state.transport,
    ]);

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
        setAssets: state.setAssets,
        setRejectedAssets: state.setRejectedAssets,
        setFilterStack: state.setFilterStack,
        filterStackRef: state.filterStackRef,
        refreshLibrary: refreshActions.refreshLibrary,
    });
    const albumActions = useMemo(() => createAlbumActions({ request }), [request]);
    const groupActions = useMemo(() => createGroupActions({ request }), [request]);
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
        addNotification: state.addNotification,
        addLog: state.addLog,
        processEvent,
        updateJobProgress,
        filterStackRef: state.filterStackRef,
    }), [
        processEvent,
        state.addLog,
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
        actions,
        filterStack: state.filterStack,
        notifications: state.notifications,
        dismissNotification: state.dismissNotification,
    };
}
