import { useCallback } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { Asset, LibraryStats, Person, TimelineGroupId } from '@contracts/core';
import type {
    BackgroundJob,
    DataStatsSnapshot,
    JobErrorSnapshot,
    RecentEventSnapshot,
    WorkflowRunListItem,
    WorkflowStatusSnapshot,
    StageState,
} from '@contracts/jobs';
import type { BackendTransport, RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { createRequestFn, writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { FolderHistoryItem, LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';
import { startWorkflowWithOverlayJob } from '@boundary/runtime/workflowOverlayJobs';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import {
    buildTimelineGroupPagePayload,
    buildTimelineGroupsPayload,
    buildTimelineJumpTargetPayload,
    getCurrentFilter,
    type GalleryOrder,
    type RefreshLibraryOptions,
} from '@ui/hooks/usePhotoLibrary.gallery';
export { createPhotoMetadataActions } from './photoMetadataActions';

type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<void>;
type AiMode = 'mock' | 'live' | 'off';
type FolderTraversalMode = 'folder_only' | 'recursive';

type SharedWorkflowActionParams = {
    transport: BackendTransport | null;
    addJob: (id: string, stage: string, title: string) => void;
    removeJob: (id: string) => void;
    sendCommand: SendCommand;
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
};

type ScanActionParams = {
    transport: BackendTransport | null;
    addJob: (id: string, stage: string, title: string) => void;
    updateJobState: (id: string, state: BackgroundJob['state']) => void;
    updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        stages?: Array<{ stageId: string; label: string; state: StageState; total?: number; done?: number }>;
    }) => void;
    addNotification: (
        type: 'warning' | 'info' | 'success' | 'error',
        title: string,
        options?: {
            message?: ReactNode;
            actionLabel?: string;
            actionKind?: 'open_workflow' | 'open_asset' | 'retry';
            actionPayload?: Record<string, unknown>;
        }
    ) => void;
    addLog: (message: string) => void;
    lastScanId: { current: string | null };
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
};

type PipelineActionParams = Pick<SharedWorkflowActionParams, 'addJob' | 'request' | 'refreshLibrary' | 'refreshSystemJobs'> & {
    updateJobState: (id: string, state: BackgroundJob['state']) => void;
    updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        stages?: Array<{ stageId: string; label: string; state: StageState; total?: number; done?: number }>;
    }) => void;
    addNotification: (
        type: 'warning' | 'info' | 'success' | 'error',
        title: string,
        options?: {
            message?: ReactNode;
            actionLabel?: string;
            actionKind?: 'open_workflow' | 'open_asset' | 'retry';
            actionPayload?: Record<string, unknown>;
        }
    ) => void;
    workflowStatus: WorkflowStatusSnapshot | null;
};

type SystemActionParams = SharedWorkflowActionParams & {
    setStatus: (status: string) => void;
    setAssets: Dispatch<SetStateAction<Asset[]>>;
    setPeople: Dispatch<SetStateAction<Person[]>>;
    setStats: Dispatch<SetStateAction<LibraryStats | null>>;
    setSystemJobs: Dispatch<SetStateAction<BackgroundJob[]>>;
    setWorkflowStatus: Dispatch<SetStateAction<WorkflowStatusSnapshot | null>>;
    setDataStats: Dispatch<SetStateAction<DataStatsSnapshot | null>>;
    setRecentEvents: Dispatch<SetStateAction<RecentEventSnapshot[]>>;
    setWorkflowRuns: Dispatch<SetStateAction<WorkflowRunListItem[]>>;
    setFolderHistory: Dispatch<SetStateAction<FolderHistoryItem[]>>;
    setRejectedAssets: Dispatch<SetStateAction<Asset[]>>;
};

type SettingsActionParams = Pick<SharedWorkflowActionParams, 'transport' | 'request'> & {
    setAssets: Dispatch<SetStateAction<Asset[]>>;
};

function refreshLibrarySnapshots(
    params: Pick<SharedWorkflowActionParams, 'refreshLibrary' | 'refreshPeople' | 'refreshSystemJobs'>,
    options?: RefreshLibraryOptions,
) {
    params.refreshLibrary(options);
    params.refreshPeople();
    params.refreshSystemJobs();
}

function clearLibrarySnapshotsBeforeReset(params: Pick<
    SystemActionParams,
    | 'setAssets'
    | 'setPeople'
    | 'setStats'
    | 'setSystemJobs'
    | 'setWorkflowStatus'
    | 'setDataStats'
    | 'setRecentEvents'
    | 'setWorkflowRuns'
    | 'setFolderHistory'
    | 'setRejectedAssets'
>) {
    clearLibrarySnapshots(params);
}

function schedulePostResetRefresh(
    params: Pick<SystemActionParams, 'refreshLibrary' | 'refreshPeople' | 'refreshSystemJobs' | 'setStatus'>,
    message: string
) {
    setTimeout(() => {
        refreshLibrarySnapshots(params);
        params.setStatus(message);
    }, 1000);
}

function getResetActions(params: Pick<
    SystemActionParams,
    | 'sendCommand'
    | 'setStatus'
    | 'setAssets'
    | 'setPeople'
    | 'setStats'
    | 'setSystemJobs'
    | 'setWorkflowStatus'
    | 'setDataStats'
    | 'setRecentEvents'
    | 'setWorkflowRuns'
    | 'setFolderHistory'
    | 'setRejectedAssets'
    | 'refreshLibrary'
    | 'refreshPeople'
    | 'refreshSystemJobs'
>) {
    return {
        resetLibrary: async () => {
            clearLibrarySnapshotsBeforeReset(params);
            params.setStatus('Resetting library data (manual data preserved)...');
            await params.sendCommand('reset_library', { mode: 'soft' });
            schedulePostResetRefresh(params, 'Library reset.');
        },
        factoryResetLibrary: async () => {
            clearLibrarySnapshotsBeforeReset(params);
            params.setStatus('Factory-resetting library and manual data...');
            await params.sendCommand('reset_library', { mode: 'factory' });
            schedulePostResetRefresh(params, 'Factory reset complete.');
        },
    };
}

export function useLibraryTransport(transport: BackendTransport | null, addLog: (message: string) => void) {
    const sendCommand = useCallback(async (command: string, payload: Record<string, unknown> = {}) => {
        if (!transport) {
            addLog('Cannot send command: backend service not ready');
            return;
        }

        await writeCommand(transport, `${command}-${Date.now()}`, command, payload);
    }, [transport, addLog]);

    const request = useCallback<RequestFn>((args) => {
        const requestFn = createRequestFn(transport);
        return requestFn(args);
    }, [transport]);

    return { sendCommand, request };
}

export function createScanActions(params: ScanActionParams) {
    return {
        estimateFolderIngest: (
            path: string,
            aiMode: AiMode = 'live',
            traversalMode: FolderTraversalMode = 'recursive',
        ): Promise<{ cost: number; fileCount: number }> => {
            return params.request<{ cost: number; fileCount: number }>({
                idPrefix: 'estimate_folder_ingest',
                command: 'estimate_folder_ingest',
                payload: {
                    folderPath: path,
                    traversalMode,
                    aiMode,
                },
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- folder-ingest estimate response is defined by the runtime command contract.
                select: (data) => data as { cost: number; fileCount: number },
            });
        },
        scanLibrary: async (
            path: string,
            aiMode: AiMode = 'live',
            traversalMode: FolderTraversalMode = 'recursive',
        ) => {
            if (!params.transport) {return;}
            const runId = await startWorkflowWithOverlayJob({
                request: params.request,
                addJob: params.addJob,
                updateJobState: params.updateJobState,
                updateJobProgress: params.updateJobProgress,
                refreshLibrary: params.refreshLibrary,
                refreshSystemJobs: params.refreshSystemJobs,
                idPrefix: 'start_folder_ingest',
                command: 'start_folder_ingest',
                payload: {
                    folderPath: path,
                    traversalMode,
                    aiMode,
                },
                workflowId: 'folder_ingest_v1',
                stage: 'scan',
                title: 'Folder ingest',
                addNotification: params.addNotification,
            });
            params.lastScanId.current = runId;
            refreshLibrarySnapshots(params, {
                galleryOrder: 'previewed_first',
                preservePagingState: true,
            });
        },
        stopScan: async () => {
            if (!params.transport || !params.lastScanId.current) {return;}

            params.addLog(`Aborting job ${params.lastScanId.current}`);
            await writeCommand(params.transport, 'cmd-abort', 'abort_job', { jobId: params.lastScanId.current });
        },
    };
}

function getWorkflowConfig(workflowId: string, assetIds: string[], workflowStatus: WorkflowStatusSnapshot | null, workflowParameters: Record<string, unknown> = {}) {
    const matched = workflowStatus?.workflows.find(w => w.workflowId === workflowId);
    const stage: string = matched?.stage || 'scan';
    const title = matched ? matched.displayName : 'Running Workflow';
    const command = 'start_workflow_run';
    const payload: Record<string, unknown> = {
        workflowId,
        triggerType: 'manual',
        inputSubjects: assetIds.map(id => ({ subjectType: 'asset', subjectId: id })),
        parameters: {
            aiMode: 'live',
            metadataPass: 'scout',
            ...workflowParameters,
        },
    };

    return { stage, title, command, payload };
}

export function createPipelineActions(params: PipelineActionParams) {
    const startWorkflow = (
        idPrefix: string,
        command: string,
        stage: string,
        title: string,
        payload: Record<string, unknown> = {},
    ) => startWorkflowWithOverlayJob({
        request: params.request,
        addJob: params.addJob,
        updateJobState: params.updateJobState,
        updateJobProgress: params.updateJobProgress,
        refreshLibrary: params.refreshLibrary,
        refreshSystemJobs: params.refreshSystemJobs,
        idPrefix,
        command,
        payload,
        addNotification: params.addNotification,
        stage,
        title,
    });

    return {
        generatePreviews: () => startWorkflow('start_library_previews', 'start_library_preview_workflow', 'preview_generation', 'Generating Library Previews'),
        detectFaces: (mediaId?: string) => startWorkflow('start_library_face', 'start_library_face_workflow', 'face_analysis', mediaId ? 'Analysing Faces for Photo' : 'Analysing Faces', mediaId ? { mediaId } : {}),
        clusterFaces: () => startWorkflow('start_library_grouping_from_faces', 'start_library_grouping', 'similarity_cluster', 'Clustering Similar Faces'),
        scanSensitive: () => startWorkflow('start_library_sensitive', 'start_library_sensitive_scan_workflow', 'sensitive_scan', 'Scanning Sensitive Content'),
        scanSensitiveAll: () => startWorkflow('start_library_sensitive_force', 'start_library_sensitive_scan_workflow', 'sensitive_scan', 'Scanning Sensitive Content'),
        extractAiMetadata: (
            mediaId?: string,
            options: AiMetadataRequestOptions = {},
            aiMode: AiMode = 'live',
        ) => (
            mediaId
                ? startWorkflow('start_selected_subject_metadata', 'start_selected_subject_metadata_workflow', 'ai_metadata', 'Generating AI Metadata', {
                    aiMode,
                    imageStrategy: options.imageStrategy ?? 'overview_only',
                    metadataPass: options.metadataPass ?? 'scout',
                    selectedSubjects: [{ subjectType: 'asset', subjectId: mediaId }],
                })
                : startWorkflow('start_library_ai_metadata', 'start_library_ai_metadata_workflow', 'ai_metadata', 'Generating AI Metadata', {
                    aiMode,
                })
        ),
        startSimulationWorkflow: (inputParams: {
            iterations?: string;
            speed?: string;
            errorType?: string;
            errorRate?: string;
            resourceLoadMode?: string;
        } = {}) => startWorkflow(
            'start_simulation_workflow',
            'start_simulation_workflow',
            'scan',
            'Workflow Simulation',
            inputParams
        ),
        runWorkflowOnAssets: (workflowId: string, assetIds: string[], workflowParameters?: Record<string, unknown>) => {
            const { stage, title, command, payload } = getWorkflowConfig(workflowId, assetIds, params.workflowStatus, workflowParameters);
            return startWorkflow(`start_workflow_${workflowId}`, command, stage, title, payload);
        },
    };
}

function clearLibrarySnapshots(params: Pick<
    SystemActionParams,
    | 'setAssets'
    | 'setPeople'
    | 'setStats'
    | 'setSystemJobs'
    | 'setWorkflowStatus'
    | 'setDataStats'
    | 'setRecentEvents'
    | 'setWorkflowRuns'
    | 'setFolderHistory'
    | 'setRejectedAssets'
>) {
    params.setAssets([]);
    params.setPeople([]);
    params.setStats({ count: 0 });
    params.setSystemJobs([]);
    params.setWorkflowStatus(null);
    params.setDataStats(null);
    params.setRecentEvents([]);
    params.setWorkflowRuns([]);
    params.setFolderHistory([]);
    params.setRejectedAssets([]);
}

export function createSystemActions(params: SystemActionParams) {
    const {
        transport,
        removeJob,
        sendCommand,
        setStatus,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        setAssets,
        setPeople,
        setStats,
        request,
        setSystemJobs,
        setWorkflowStatus,
        setDataStats,
        setRecentEvents,
        setWorkflowRuns,
        setFolderHistory,
        setRejectedAssets,
    } = params;

    const resetActions = getResetActions({
        sendCommand,
        setStatus,
        setAssets,
        setPeople,
        setStats,
        setSystemJobs,
        setWorkflowStatus,
        setDataStats,
        setRecentEvents,
        setWorkflowRuns,
        setFolderHistory,
        setRejectedAssets,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
    });
    return {
        stopJob: async (jobId: string) => {
            if (!transport) {return;}
            await writeCommand(transport, `cmd-stop-${Date.now()}`, 'stop_job', { jobId });
            refreshSystemJobs();
        },
        removeQueuedJob: async (jobId: string) => {
            if (!transport) {return;}
            await writeCommand(transport, `cmd-remove-${Date.now()}`, 'stop_job', { jobId });
            removeJob(jobId);
            refreshSystemJobs();
        },
        clearJobErrors: async (task: string) => {
            if (!transport) {return;}

            await writeCommand(transport, `cmd-clear-${Date.now()}`, 'clear_job_errors', { task });
            refreshSystemJobs();
        },
        getJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }): Promise<JobErrorSnapshot> => request<JobErrorSnapshot>({
            idPrefix: `get_job_errors_${payload.moduleId || 'all'}_${payload.page || 1}`,
            command: 'get_job_errors',
            payload,
            timeoutMs: 10000,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- job-error response is the typed runtime command payload.
            select: (data) => data as unknown as JobErrorSnapshot,
        }),
        resetLibrary: resetActions.resetLibrary,
        factoryResetLibrary: resetActions.factoryResetLibrary,
    };
}

function performGetSetting(request: RequestFn, key: string): Promise<string> {
    return request<string>({
        idPrefix: `get_setting_${key}`,
        command: 'get_setting',
        payload: { key },
        select: (data) => {
            const value = data && typeof data === 'object' && 'value' in data ? data.value : undefined;
            return typeof value === 'string' ? value : '';
        },
    });
}

async function performSetSetting(transport: BackendTransport | null, key: string, value: string) {
    if (!transport) {return;}
    await writeCommand(transport, `set_setting_${key}_${Date.now()}`, 'set_setting', { key, value });
}

async function performSetSensitivity(
    transport: BackendTransport | null,
    setAssets: Dispatch<SetStateAction<Asset[]>>,
    assetId: string,
    status: string | null
) {
    if (!transport) {return;}
    await writeCommand(transport, `set-sensitivity-${Date.now()}`, 'set_sensitivity', { assetId, status });
    setAssets((prev) => prev.map((asset) => asset.id === assetId ? { ...asset, sensitivity_status: status } : asset));
}

function performGetEventPayloadRaw(request: RequestFn, eventId: string): Promise<string> {
    return request<string>({
        idPrefix: `get_event_payload_${eventId}`,
        command: 'get_event_payload',
        payload: { eventId },
        timeoutMs: 10000,
        select: (data) => {
            const payloadJson = data && typeof data === 'object' && 'payloadJson' in data ? data.payloadJson : undefined;
            return typeof payloadJson === 'string' ? payloadJson : '';
        },
    });
}

async function performTestProviderKey(request: RequestFn, provider: string, key: string): Promise<{ valid: boolean; error?: string }> {
    return request<{ valid: boolean; error?: string }>({
        idPrefix: `test_provider_key_${provider}`,
        command: 'test_provider_key',
        payload: { provider, key },
        select: (data) => {
            if (data && typeof data === 'object') {
                const valid = 'valid' in data && typeof data.valid === 'boolean' ? data.valid : false;
                const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
                return { valid, error };
            }
            return { valid: false, error: 'Invalid response from backend' };
        },
    });
}

async function performSaveProviderKey(request: RequestFn, provider: string, key: string): Promise<{ success: boolean; error?: string }> {
    return request<{ success: boolean; error?: string }>({
        idPrefix: `save_provider_key_${provider}`,
        command: 'save_provider_key',
        payload: { provider, key },
        select: (data) => {
            if (data && typeof data === 'object') {
                const success = 'success' in data && typeof data.success === 'boolean' ? data.success : false;
                const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
                return { success, error };
            }
            return { success: false, error: 'Invalid response from backend' };
        },
    });
}

async function performDeleteProviderKey(request: RequestFn, provider: string): Promise<{ success: boolean; error?: string }> {
    return request<{ success: boolean; error?: string }>({
        idPrefix: `delete_provider_key_${provider}`,
        command: 'delete_provider_key',
        payload: { provider },
        select: (data) => {
            if (data && typeof data === 'object') {
                const success = 'success' in data && typeof data.success === 'boolean' ? data.success : false;
                const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
                return { success, error };
            }
            return { success: false, error: 'Invalid response from backend' };
        },
    });
}

async function performGetRedactedProviderKey(request: RequestFn, provider: string): Promise<{ redactedKey: string | null; error?: string }> {
    return request<{ redactedKey: string | null; error?: string }>({
        idPrefix: `get_redacted_provider_key_${provider}`,
        command: 'get_redacted_provider_key',
        payload: { provider },
        select: (data) => {
            if (data && typeof data === 'object') {
                const redactedKey = 'redactedKey' in data && (typeof data.redactedKey === 'string' || data.redactedKey === null) ? data.redactedKey : null;
                const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
                return { redactedKey, error };
            }
            return { redactedKey: null, error: 'Invalid response from backend' };
        },
    });
}

export function createSettingsActions(params: SettingsActionParams) {
    return {
        getSetting: (key: string) => performGetSetting(params.request, key),
        setSetting: (key: string, value: string) => performSetSetting(params.transport, key, value),
        setSensitivity: (assetId: string, status: string | null) => performSetSensitivity(params.transport, params.setAssets, assetId, status),
        getEventPayloadRaw: (eventId: string) => performGetEventPayloadRaw(params.request, eventId),
        testProviderKeyCommand: (provider: string, key: string) => performTestProviderKey(params.request, provider, key),
        saveProviderKey: (provider: string, key: string) => performSaveProviderKey(params.request, provider, key),
        deleteProviderKey: (provider: string) => performDeleteProviderKey(params.request, provider),
        getRedactedProviderKey: (provider: string) => performGetRedactedProviderKey(params.request, provider),
    };
}

export function createRefreshActions(sendCommand: SendCommand, filterStackRef: { current: LibraryFilter[] }) {
    return {
        refreshLibrary: (options: RefreshLibraryOptions = {}) => {
            void sendCommand('get_stats');
            const stack = filterStackRef.current;
            const currentFilter = stack.at(-1);
            void sendCommand('get_assets', {
                limit: ASSET_PAGE_SIZE,
                offset: 0,
                filter: currentFilter,
                detailLevel: 'gallery',
                galleryOrder: options.galleryOrder ?? 'default',
                gallerySeek: options.gallerySeek ?? null,
            });
        },
        refreshPeople: () => {
            void sendCommand('get_people');
        },
        refreshSystemJobs: () => {
            void sendCommand('get_system_jobs');
        },
    };
}

export function createTimelinePagingActions(
    sendCommand: SendCommand,
    filterStackRef: { current: LibraryFilter[] },
    galleryOrderRef: { current: GalleryOrder },
    timelineState?: {
        setTimelineGroupLoading: (groupId: TimelineGroupId, isLoading: boolean) => void;
        setTimelineActiveJumpTarget: (target: { groupId: TimelineGroupId } | null) => void;
    },
) {
    return {
        refreshTimelineGroups: () => {
            void sendCommand('get_timeline_groups', buildTimelineGroupsPayload({
                filter: getCurrentFilter(filterStackRef),
                galleryOrder: galleryOrderRef.current,
            }));
        },
        loadTimelineGroupPage: (groupId: string, options: { cursor?: string | null; limit?: number } = {}) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- timeline group IDs originate from the runtime timeline response.
            timelineState?.setTimelineGroupLoading(groupId as TimelineGroupId, true);
            void sendCommand('get_timeline_group_page', buildTimelineGroupPagePayload({
                filter: getCurrentFilter(filterStackRef),
                galleryOrder: galleryOrderRef.current,
                groupId,
                cursor: options.cursor ?? null,
                limit: options.limit,
            }));
        },
        requestTimelineJumpTarget: (groupId: string) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- timeline group IDs originate from the runtime timeline response.
            timelineState?.setTimelineActiveJumpTarget({ groupId: groupId as TimelineGroupId });
            void sendCommand('get_timeline_jump_target', buildTimelineJumpTargetPayload({
                filter: getCurrentFilter(filterStackRef),
                galleryOrder: galleryOrderRef.current,
                groupId,
            }));
        },
    };
}
