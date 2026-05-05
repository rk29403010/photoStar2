import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';

export type WorkflowRunStepDetail = {
    stepRunId?: string;
    nodeId: string;
    status: string;
    totalItems: number;
    completedItems: number;
    failedItems?: number;
    errorMessage?: string;
    failedSubjects?: Array<{
        subjectType: string;
        subjectId: string;
        label: string;
        originalPath?: string;
    }>;
};

export type WorkflowRunDetailResponse = {
    summary?: {
        runId?: string;
        workflowId?: string;
        status?: string;
        totalItems?: number;
        completedItems?: number;
        failedItems?: number;
    };
    parameters?: Record<string, unknown>;
    milestones?: Array<{ milestoneId: string; label: string; status: string }>;
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
