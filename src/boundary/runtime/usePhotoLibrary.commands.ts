import { useCallback } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { Asset, LibraryStats, Person, TimelineGroupId } from '@contracts/core';
import type {
    BackgroundJob,
    DataStatsSnapshot,
    JobErrorSnapshot,
    PipelineStage,
    RecentEventSnapshot,
    WorkflowRunListItem,
    WorkflowStatusSnapshot,
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

type SharedWorkflowActionParams = {
    transport: BackendTransport | null;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    removeJob: (id: string) => void;
    sendCommand: SendCommand;
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
};

type ScanActionParams = {
    transport: BackendTransport | null;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: BackgroundJob['state']) => void;
    updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        stages?: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
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
        stages?: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
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
        estimateFolderIngest: (path: string, aiMode: AiMode = 'live'): Promise<{ cost: number; fileCount: number }> => {
            return params.request<{ cost: number; fileCount: number }>({
                idPrefix: 'estimate_folder_ingest',
                command: 'estimate_folder_ingest',
                payload: {
                    folderPath: path,
                    traversalMode: 'recursive',
                    aiMode,
                },
                select: (data) => data as { cost: number; fileCount: number },
            });
        },
        scanLibrary: async (path: string, aiMode: AiMode = 'live') => {
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
                    traversalMode: 'recursive',
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

function getWorkflowConfig(workflowId: string, assetIds: string[]) {
    let stage: PipelineStage = 'scan';
    let title = 'Running Workflow';
    let command = 'start_workflow_run';
    let payload: Record<string, unknown> = {
        workflowId,
        triggerType: 'manual',
        inputSubjects: assetIds.map(id => ({ subjectType: 'asset', subjectId: id })),
    };

    if (workflowId === 'library_previews_v1') {
        stage = 'preview_generation';
        title = 'Generating Previews';
    } else if (workflowId === 'library_face_pipeline_v1') {
        stage = 'face_analysis';
        title = 'Analysing Faces';
    } else if (workflowId === 'library_ai_metadata_v1') {
        stage = 'ai_metadata';
        title = 'Generating AI Metadata';
        command = 'start_selected_subject_metadata_workflow';
        payload = {
            aiMode: 'live',
            imageStrategy: 'overview_only',
            metadataPass: 'scout',
            selectedSubjects: assetIds.map(id => ({ subjectType: 'asset', subjectId: id })),
        };
    } else if (workflowId === 'library_sensitive_scan_v1') {
        stage = 'sensitive_scan';
        title = 'Scanning Sensitive Content';
    } else if (workflowId === 'library_photo_date_v1') {
        title = 'Estimating Photo Dates';
    }
    return { stage, title, command, payload };
}

export function createPipelineActions(params: PipelineActionParams) {
    const startWorkflow = (
        idPrefix: string,
        command: string,
        stage: PipelineStage,
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
        runWorkflowOnAssets: (workflowId: string, assetIds: string[]) => {
            const { stage, title, command, payload } = getWorkflowConfig(workflowId, assetIds);
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
            select: (data) => data as unknown as JobErrorSnapshot,
        }),
        resetLibrary: resetActions.resetLibrary,
        factoryResetLibrary: resetActions.factoryResetLibrary,
    };
}

export function createSettingsActions(params: SettingsActionParams) {
    const { transport, request, setAssets } = params;

    return {
        getSetting: (key: string): Promise<string> => request<string>({
            idPrefix: `get_setting_${key}`,
            command: 'get_setting',
            payload: { key },
            select: (data) => String(data?.value || ''),
        }),
        setSetting: async (key: string, value: string) => {
            if (!transport) {return;}
            await writeCommand(transport, `set_setting_${key}_${Date.now()}`, 'set_setting', { key, value });
        },
        setSensitivity: async (assetId: string, status: string | null) => {
            if (!transport) {return;}

            await writeCommand(transport, `set-sensitivity-${Date.now()}`, 'set_sensitivity', { assetId, status });
            setAssets((prev) => prev.map((asset) => asset.id === assetId ? { ...asset, sensitivity_status: status } : asset));
        },
        getEventPayloadRaw: (eventId: string): Promise<string> => request<string>({
            idPrefix: `get_event_payload_${eventId}`,
            command: 'get_event_payload',
            payload: { eventId },
            timeoutMs: 10000,
            select: (data) => String(data?.payloadJson || ''),
        }),
    };
}

export function createRefreshActions(sendCommand: SendCommand, filterStackRef: { current: LibraryFilter[] }) {
    return {
        refreshLibrary: (options: RefreshLibraryOptions = {}) => {
            void sendCommand('get_stats');
            const stack = filterStackRef.current;
            const currentFilter = stack.length > 0 ? stack[stack.length - 1] : undefined;
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
            timelineState?.setTimelineActiveJumpTarget({ groupId: groupId as TimelineGroupId });
            void sendCommand('get_timeline_jump_target', buildTimelineJumpTargetPayload({
                filter: getCurrentFilter(filterStackRef),
                galleryOrder: galleryOrderRef.current,
                groupId,
            }));
        },
    };
}
