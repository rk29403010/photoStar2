import type { WorkflowVisualiserDetail } from '@contracts/workflowVisualiser';

export const WORKFLOW_DEFINITION_ONLY_RUN_ID = '__definition_only__';

export const WORKFLOW_WORKSPACE_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'progression', label: 'Progression' },
    { id: 'graph', label: 'Runtime graph' },
    { id: 'sequence', label: 'Sequence map' },
    { id: 'text', label: 'Text' },
] as const;

export type WorkflowWorkspaceTabId = typeof WORKFLOW_WORKSPACE_TABS[number]['id'];

export interface WorkflowSequenceMapViewport {
    x: number;
    y: number;
    zoom: number;
}

export function getDefaultWorkflowWorkspaceTab(): WorkflowWorkspaceTabId {
    return 'overview';
}

export function tabSupportsInspector(tabId: WorkflowWorkspaceTabId): boolean {
    return tabId === 'progression' || tabId === 'graph' || tabId === 'sequence';
}

export function getWorkflowDetail(
    source: { details: WorkflowVisualiserDetail[] },
    detailId: string | null,
): WorkflowVisualiserDetail | null {
    if (!detailId) {
        return null;
    }

    return source.details.find((detail) => detail.id === detailId) ?? null;
}

export function getWorkflowVisualiserRequestedRunId(selectionValue: string | null): string | null | undefined {
    if (selectionValue === null) {
        return undefined;
    }

    if (selectionValue === WORKFLOW_DEFINITION_ONLY_RUN_ID) {
        return null;
    }

    return selectionValue;
}

export function getWorkflowWorkspaceRunSelectionValue(
    selectionValue: string | null,
    modelSelectedRunId: string | null,
): string {
    if (selectionValue === WORKFLOW_DEFINITION_ONLY_RUN_ID) {
        return WORKFLOW_DEFINITION_ONLY_RUN_ID;
    }

    return selectionValue ?? modelSelectedRunId ?? '';
}

export function getWorkflowWorkspaceRefreshIntervalMs(
    model: { selectedRun: { status: string } | null } | null,
): number | null {
    return model?.selectedRun?.status === 'running' ? 1000 : null;
}

export function getWorkflowWorkspaceRetryLabel(loading: boolean): string {
    return loading ? 'Starting resume...' : 'Resume Workflow';
}

export function getWorkflowWorkspaceRetryFeedback(params: {
    loading: boolean;
    assetCount?: number;
    resumeRequestCompleted?: boolean;
    selectedRun?: { status: string; completedItems: number; totalItems: number } | null;
}): string | null {
    if (params.loading) {
        return 'Starting resume...';
    }

    if (params.selectedRun?.status === 'running') {
        return `Resume running · ${params.selectedRun.completedItems}/${params.selectedRun.totalItems} items`;
    }

    if (typeof params.assetCount === 'number' && params.assetCount > 0) {
        return `Resume started for ${params.assetCount} items.`;
    }

    if (params.resumeRequestCompleted && params.assetCount === 0) {
        return 'No remaining photos needed AI metadata.';
    }

    return null;
}

export function shouldFitSequenceMapViewport(viewport: WorkflowSequenceMapViewport | null): boolean {
    return viewport === null;
}
