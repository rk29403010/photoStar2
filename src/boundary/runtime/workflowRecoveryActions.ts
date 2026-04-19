import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { requestWorkflowRunDetail } from '@boundary/runtime/workflowRunDetail';

export function createWorkflowRecoveryActions(params: {
    request: RequestFn;
}) {
    const { request } = params;

    return {
        getWorkflowRunDetail: (runId: string) => requestWorkflowRunDetail(request, runId),
        rerunMissingFolderAiMetadata: (runId: string): Promise<{ runId: string | null; assetCount: number }> => request({
            idPrefix: `rerun_missing_folder_ai_metadata_${runId}`,
            command: 'rerun_missing_folder_ai_metadata',
            payload: { runId },
            timeoutMs: 10000,
            select: (data) => ({
                runId: typeof data?.runId === 'string' ? data.runId : null,
                assetCount: typeof data?.assetCount === 'number' ? data.assetCount : 0,
            }),
        }),
    };
}
