import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';

export type WorkflowRunStepDetail = {
    nodeId: string;
    status: string;
    totalItems: number;
    completedItems: number;
    errorMessage?: string;
};

export type WorkflowRunDetailResponse = {
    summary?: {
        status?: string;
    };
    steps?: WorkflowRunStepDetail[];
};

export async function requestWorkflowRunDetail(request: RequestFn, runId: string): Promise<WorkflowRunDetailResponse> {
    return request<WorkflowRunDetailResponse>({
        idPrefix: `workflow_run_status_${runId}`,
        command: 'get_workflow_run_detail',
        payload: { runId },
        timeoutMs: 10000,
        select: (data) => data as WorkflowRunDetailResponse,
    });
}
