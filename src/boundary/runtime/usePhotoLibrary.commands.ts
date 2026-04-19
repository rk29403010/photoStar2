import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Asset, LibraryStats, Person } from '@contracts/core';
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
import type { FolderHistoryItem, LibraryFilter, UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';
import { startWorkflowWithOverlayJob } from '@boundary/runtime/workflowOverlayJobs';
import { requestWorkflowRunDetail } from '@boundary/runtime/workflowRunDetail';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import { buildIngestStatusMessage, buildWorkflowPollDetail } from '@shared/utils/libraryUiDiagnostics';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';
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
    addLog: (message: string) => void;
    addUiFeedEntry: (entry: UiFeedEntry) => void;
    lastScanId: { current: string | null };
    activeWorkflowRunId: { current: string | null };
    workflowRefreshTimeout: { current: ReturnType<typeof setTimeout> | null };
    setIngestStatusMessage: (message: string | null) => void;
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
};

type PipelineActionParams = Pick<SharedWorkflowActionParams, 'addJob' | 'request' | 'refreshLibrary' | 'refreshSystemJobs'> & {
    updateJobState: (id: string, state: BackgroundJob['state']) => void;
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

function clearWorkflowRefreshLoop(workflowRefreshTimeout: ScanActionParams['workflowRefreshTimeout']) {
    if (workflowRefreshTimeout.current !== null) {
        clearTimeout(workflowRefreshTimeout.current);
        workflowRefreshTimeout.current = null;
    }
}

function createUiFeedEntry(source: UiFeedEntry['source'], label: string, detail: string, requestId?: string): UiFeedEntry {
    return {
        id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        source,
        label,
        detail,
        requestId,
    };
}

function scheduleWorkflowRefresh(params: Pick<
    ScanActionParams,
    'activeWorkflowRunId' | 'workflowRefreshTimeout' | 'request' | 'addLog' | 'addUiFeedEntry' | 'setIngestStatusMessage' | 'refreshLibrary' | 'refreshPeople' | 'refreshSystemJobs'
>, runId: string) {
    params.activeWorkflowRunId.current = runId;
    clearWorkflowRefreshLoop(params.workflowRefreshTimeout);
    params.setIngestStatusMessage('Scanning folder...');
    params.addUiFeedEntry(createUiFeedEntry('workflow_poll', 'Folder ingest started', 'Waiting for workflow detail.', runId));

    const poll = async () => {
        if (params.activeWorkflowRunId.current !== runId) {
            return;
        }

        refreshLibrarySnapshots(params, {
            galleryOrder: 'previewed_first',
            preservePagingState: true,
        });

        try {
            const detail = await requestWorkflowRunDetail(params.request, runId);
            const status = String(detail.summary?.status || '');
            params.setIngestStatusMessage(buildIngestStatusMessage(detail));
            params.addUiFeedEntry(createUiFeedEntry('workflow_poll', 'Workflow detail', buildWorkflowPollDetail(detail), runId));
            if (status === 'completed' || status === 'failed') {
                params.activeWorkflowRunId.current = null;
                clearWorkflowRefreshLoop(params.workflowRefreshTimeout);
                params.setIngestStatusMessage(null);
                refreshLibrarySnapshots(params);
                return;
            }
        } catch (error) {
            params.activeWorkflowRunId.current = null;
            clearWorkflowRefreshLoop(params.workflowRefreshTimeout);
            params.setIngestStatusMessage(null);
            params.addLog(`Folder ingest refresh stopped: ${String(error)}`);
            params.addUiFeedEntry(createUiFeedEntry('workflow_poll', 'Workflow detail failed', String(error), runId));
            return;
        }

        params.workflowRefreshTimeout.current = setTimeout(() => {
            void poll();
        }, 1500);
    };

    params.workflowRefreshTimeout.current = setTimeout(() => {
        void poll();
    }, 1500);
}

async function startFolderIngestRun(request: RequestFn, path: string, aiMode: AiMode): Promise<string> {
    return request<string>({
        idPrefix: 'start_folder_ingest',
        command: 'start_folder_ingest',
        payload: {
            folderPath: path,
            traversalMode: 'recursive',
            aiMode,
        },
        timeoutMs: 10000,
        select: (data) => String(data?.runId || ''),
    });
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
        scanLibrary: async (path: string, aiMode: AiMode = 'live') => {
            if (!params.transport) {return;}
            const runId = await startFolderIngestRun(params.request, path, aiMode);
            params.lastScanId.current = runId;
            refreshLibrarySnapshots(params, {
                galleryOrder: 'previewed_first',
                preservePagingState: true,
            });
            if (runId) {
                scheduleWorkflowRefresh(params, runId);
            }
        },
        stopScan: async () => {
            clearWorkflowRefreshLoop(params.workflowRefreshTimeout);
            params.activeWorkflowRunId.current = null;
            params.setIngestStatusMessage(null);
            if (!params.transport || !params.lastScanId.current) {return;}

            params.addLog(`Aborting job ${params.lastScanId.current}`);
            await writeCommand(params.transport, 'cmd-abort', 'abort_job', { jobId: params.lastScanId.current });
        },
    };
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
        refreshLibrary: params.refreshLibrary,
        refreshSystemJobs: params.refreshSystemJobs,
        idPrefix,
        command,
        payload,
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
