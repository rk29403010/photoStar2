import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Asset, LibraryStats, Person } from '@contracts/core';
import type { JobErrorSnapshot, PipelineStage } from '@contracts/jobs';
import type { BackendTransport, RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { createRequestFn, writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';

type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<void>;

type SharedWorkflowActionParams = {
    transport: BackendTransport | null;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    removeJob: (id: string) => void;
    sendCommand: SendCommand;
    request: RequestFn;
    refreshLibrary: () => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
};

type ScanActionParams = {
    transport: BackendTransport | null;
    addLog: (message: string) => void;
    lastScanId: { current: string | null };
};

type PipelineActionParams = Pick<SharedWorkflowActionParams, 'transport' | 'addJob'>;

type SystemActionParams = SharedWorkflowActionParams & {
    isSystemPaused: boolean;
    setStatus: (status: string) => void;
    setAssets: Dispatch<SetStateAction<Asset[]>>;
    setPeople: Dispatch<SetStateAction<Person[]>>;
    setStats: Dispatch<SetStateAction<LibraryStats | null>>;
};

type SettingsActionParams = Pick<SharedWorkflowActionParams, 'transport' | 'request'> & {
    setAssets: Dispatch<SetStateAction<Asset[]>>;
};

export function useLibraryTransport(transport: BackendTransport | null, addLog: (message: string) => void) {
    const sendCommand = useCallback(async (command: string, payload: Record<string, unknown> = {}) => {
        if (!transport) {
            addLog('Cannot send command: Sidecar not ready');
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
    const { transport, lastScanId, addLog } = params;

    return {
        scanLibrary: async (path: string) => {
            if (!transport) {return;}
            const jobId = `scan-${Date.now()}`;
            lastScanId.current = jobId;
            await writeCommand(transport, jobId, 'scan_folder', { path });
        },
        stopScan: async () => {
            if (!transport || !lastScanId.current) {return;}

            addLog(`Aborting job ${lastScanId.current}`);
            await writeCommand(transport, 'cmd-abort', 'abort_job', { jobId: lastScanId.current });
        },
    };
}

export function createPipelineActions(params: PipelineActionParams) {
    const { transport, addJob } = params;

    const launch = async (idPrefix: string, task: PipelineStage, title: string, command: string, payload: Record<string, unknown> = {}) => {
        const jobId = `${idPrefix}-${Date.now()}`;
        addJob(jobId, task, title);
        if (transport) {
            await writeCommand(transport, jobId, command, payload);
        }
        return jobId;
    };

    return {
        generatePreviews: () => launch('previews', 'preview_generation', 'Generate Previews', 'generate_previews'),
        detectFaces: () => launch('detect', 'face_analysis', 'Detect Faces', 'detect_faces'),
        recogniseFaces: () => launch('recog', 'face_analysis', 'Recognise Faces', 'recognise_faces'),
        clusterFaces: () => launch('cluster', 'similarity_cluster', 'Cluster Faces', 'cluster_faces'),
        scanSensitive: () => launch('sensitive', 'sensitive_scan', 'Sensitive Content Scan', 'scan_sensitive'),
        scanSensitiveAll: () => launch('sensitive-force', 'sensitive_scan', 'Force Re-scan All (Sensitive)', 'scan_sensitive_force'),
        extractAiMetadata: (mediaId?: string) => launch('ai_meta_v2_3f', 'ai_metadata_v2_3f', 'AI Metadata V2 (Gemini 3F)', 'extract_ai_metadata', mediaId ? { mediaId } : {}),
    };
}

export function createSystemActions(params: SystemActionParams) {
    const { transport, removeJob, sendCommand, setStatus, refreshLibrary, refreshPeople, refreshSystemJobs, isSystemPaused, setAssets, setPeople, setStats, request } = params;

    return {
        toggleSystemPause: () => {
            void sendCommand(isSystemPaused ? 'resume_jobs' : 'pause_jobs');
        },
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
        setModulePaused: async (moduleId: string, paused: boolean) => {
            if (!transport) {return;}

            await writeCommand(transport, `cmd-module-pause-${Date.now()}`, 'set_module_paused', { moduleId, paused });
            refreshSystemJobs();
        },
        getJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }): Promise<JobErrorSnapshot> => request<JobErrorSnapshot>({
            idPrefix: `get_job_errors_${payload.moduleId || 'all'}_${payload.page || 1}`,
            command: 'get_job_errors',
            payload,
            timeoutMs: 10000,
            select: (data) => data as unknown as JobErrorSnapshot,
        }),
        resetFaces: async () => {
            setStatus('Resetting faces...');
            await sendCommand('reset_faces');
            setTimeout(() => {
                refreshLibrary();
                refreshPeople();
                setStatus('Faces reset.');
            }, 1000);
        },
        resetLibrary: async () => {
            setAssets([]);
            setPeople([]);
            setStats({ count: 0 });
            setStatus('Resetting library data (manual data preserved)...');
            await sendCommand('reset_library', { mode: 'soft' });
            setTimeout(() => {
                refreshLibrary();
                setStatus('Library reset.');
            }, 1000);
        },
        factoryResetLibrary: async () => {
            setAssets([]);
            setPeople([]);
            setStats({ count: 0 });
            setStatus('Factory-resetting library and manual data...');
            await sendCommand('reset_library', { mode: 'factory' });
            setTimeout(() => {
                refreshLibrary();
                setStatus('Factory reset complete.');
            }, 1000);
        },
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
        refreshLibrary: () => {
            void sendCommand('get_stats');
            const stack = filterStackRef.current;
            const currentFilter = stack.length > 0 ? stack[stack.length - 1] : undefined;
            void sendCommand('get_assets', { limit: ASSET_PAGE_SIZE, offset: 0, filter: currentFilter, detailLevel: 'gallery' });
        },
        refreshPeople: () => {
            void sendCommand('get_people');
        },
        refreshSystemJobs: () => {
            void sendCommand('get_system_jobs');
        },
    };
}
