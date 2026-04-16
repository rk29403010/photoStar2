import type { JobState, PipelineStage } from '@contracts/jobs';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';

type WorkflowRunDetailResponse = {
    summary?: {
        status?: string;
    };
};

type ScheduleWorkflowRunRefreshParams = {
    request: RequestFn;
    updateJobState: (id: string, state: JobState) => void;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshSystemJobs: () => void;
    localJobId: string;
    runId: string;
    onCompleted?: () => void;
};

type StartWorkflowWithOverlayJobParams = {
    request: RequestFn;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: JobState) => void;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshSystemJobs: () => void;
    idPrefix: string;
    command: string;
    payload?: Record<string, unknown>;
    stage: PipelineStage;
    title: string;
    onCompleted?: () => void;
};

async function getWorkflowRunDetail(request: RequestFn, runId: string): Promise<WorkflowRunDetailResponse> {
    return request<WorkflowRunDetailResponse>({
        idPrefix: `workflow_run_status_${runId}`,
        command: 'get_workflow_run_detail',
        payload: { runId },
        timeoutMs: 10000,
        select: (data) => data as WorkflowRunDetailResponse,
    });
}

export function scheduleWorkflowRunRefresh(params: ScheduleWorkflowRunRefreshParams) {
    const poll = async () => {
        params.refreshLibrary({ preservePagingState: true });
        params.refreshSystemJobs();

        try {
            const detail = await getWorkflowRunDetail(params.request, params.runId);
            const status = String(detail.summary?.status || '');

            if (status === 'completed') {
                params.updateJobState(params.localJobId, 'completed');
                params.refreshLibrary();
                params.refreshSystemJobs();
                params.onCompleted?.();
                return;
            }

            if (status === 'failed') {
                params.updateJobState(params.localJobId, 'failed');
                params.refreshSystemJobs();
                return;
            }
        } catch {
            params.updateJobState(params.localJobId, 'failed');
            params.refreshSystemJobs();
            return;
        }

        window.setTimeout(() => {
            void poll();
        }, 1500);
    };

    window.setTimeout(() => {
        void poll();
    }, 1500);
}

export async function startWorkflowWithOverlayJob(params: StartWorkflowWithOverlayJobParams): Promise<string> {
    const localJobId = `${params.idPrefix}-overlay-${Date.now()}`;
    params.addJob(localJobId, params.stage, params.title);
    params.updateJobState(localJobId, 'starting');

    const runId = await params.request<string>({
        idPrefix: `${params.idPrefix}_${Date.now()}`,
        command: params.command,
        payload: params.payload ?? {},
        timeoutMs: 10000,
        select: (data) => String(data?.runId || ''),
    });

    if (!runId) {
        params.updateJobState(localJobId, 'failed');
        return '';
    }

    params.updateJobState(localJobId, 'running');
    scheduleWorkflowRunRefresh({
        request: params.request,
        updateJobState: params.updateJobState,
        refreshLibrary: params.refreshLibrary,
        refreshSystemJobs: params.refreshSystemJobs,
        localJobId,
        runId,
        onCompleted: params.onCompleted,
    });

    return runId;
}
