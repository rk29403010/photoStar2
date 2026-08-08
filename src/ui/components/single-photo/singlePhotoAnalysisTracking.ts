import type { Asset } from '@contracts/core';
import type { WorkflowRunDetailResponse } from '@boundary/runtime/workflowRunDetail';

export type AnalysisWorkflowUiState = 'idle' | 'analyzing' | 'cancelling' | 'error';

export function shouldCompleteAnalysisRun(params: {
    analyzingAssetId: string | null;
    currentAssetId: string | undefined;
    currentAiMetadata: Asset['ai_metadata'] | undefined;
    runStartAiMetadata: Asset['ai_metadata'] | undefined;
    completedAssetId: string | null;
}): boolean {
    if (!params.analyzingAssetId) {
        return false;
    }

    if (params.currentAssetId !== params.analyzingAssetId) {
        return false;
    }

    if (!params.currentAiMetadata) {
        return false;
    }

    if (params.currentAiMetadata === params.runStartAiMetadata) {
        return false;
    }

    return params.completedAssetId !== params.analyzingAssetId;
}

function formatNodeLabel(nodeId: string): string {
    if (!nodeId) {
        return 'Workflow';
    }

    const label = nodeId.replaceAll(/[-_]+/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getAnalysisWorkflowFailureMessage(detail: WorkflowRunDetailResponse | null | undefined): string | null {
    if (detail?.summary?.status !== 'failed') {
        return null;
    }

    const failedStep = detail.steps?.find((step) => step.status === 'failed');
    if (!failedStep) {
        return 'AI metadata analysis failed.';
    }

    return failedStep.errorMessage ?? `${formatNodeLabel(failedStep.nodeId)} failed.`;
}

export function isTransientWorkflowDetailError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('Timeout for get_workflow_run_detail');
}

export function canStartObjectAnalysis(state: AnalysisWorkflowUiState): boolean {
    return state === 'idle' || state === 'error';
}

export function isAnalysisWorkflowTerminal(detail: WorkflowRunDetailResponse | null | undefined): boolean {
    const status = detail?.summary?.status;
    return status === 'completed' || status === 'failed';
}
