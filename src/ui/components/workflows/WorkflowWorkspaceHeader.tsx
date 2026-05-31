import type React from 'react';
import type { WorkflowVisualiserLinkedRun, WorkflowVisualiserModel, WorkflowVisualiserWorkflowSummary } from '@contracts/workflowVisualiser';
import { Button, Select } from '../Primitives';
import {
    getWorkflowWorkspaceRetryFeedback,
    getWorkflowWorkspaceRetryLabel,
    WORKFLOW_DEFINITION_ONLY_RUN_ID,
    WORKFLOW_WORKSPACE_TABS,
    type WorkflowWorkspaceTabId,
} from './workflowWorkspaceModel';

type WorkflowWorkspaceHeaderProps = {
    readonly model: WorkflowVisualiserModel;
    readonly selectedWorkflowId: string;
    readonly onSelectWorkflow: (workflowId: string) => void;
    readonly activeTab: WorkflowWorkspaceTabId;
    readonly onSelectTab: (tabId: WorkflowWorkspaceTabId) => void;
    readonly selectedRunValue: string;
    readonly onSelectRun: (runSelection: string | null) => void;
    readonly retryState?: {
        enabled: boolean;
        loading: boolean;
        assetCount?: number;
        requestCompleted?: boolean;
        onRetry: () => void;
    };
}

export const WorkflowWorkspaceHeader: React.FC<WorkflowWorkspaceHeaderProps> = ({
    model,
    selectedWorkflowId,
    onSelectWorkflow,
    activeTab,
    onSelectTab,
    selectedRunValue,
    onSelectRun,
    retryState,
}) => {
    const linkedRecoveryRuns = (model.selectedRun?.linkedRuns ?? []).filter((run) => run.relationship === 'recovery');
    const retryFeedback = getWorkflowWorkspaceRetryFeedback({
        loading: retryState?.loading ?? false,
        assetCount: retryState?.assetCount,
        resumeRequestCompleted: retryState?.requestCompleted ?? false,
        selectedRun: model.selectedRun,
    });

    return (
        <header className="rounded-2xl border border-content/10 bg-surface-secondary p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <WorkflowSelector
                    availableWorkflows={model.availableWorkflows}
                    selectedWorkflowId={selectedWorkflowId}
                    onSelectWorkflow={onSelectWorkflow}
                />

                <RunContextPanel
                    model={model}
                    linkedRecoveryRuns={linkedRecoveryRuns}
                    selectedRunValue={selectedRunValue}
                    onSelectRun={onSelectRun}
                    retryState={retryState}
                    retryFeedback={retryFeedback}
                />
            </div>

            <div className="flex flex-wrap gap-2">
                {WORKFLOW_WORKSPACE_TABS.map((tab) => (
                    <Button
                        key={tab.id}
                        onClick={() => onSelectTab(tab.id)}
                        variant={activeTab === tab.id ? 'primary' : 'secondary'}
                        className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                    >
                        {tab.label}
                    </Button>
                ))}
            </div>
        </header>
    );
};

function WorkflowSelector(props: {
    readonly availableWorkflows: WorkflowVisualiserWorkflowSummary[];
    readonly selectedWorkflowId: string;
    readonly onSelectWorkflow: (workflowId: string) => void;
}) {
    return (
        <div className="flex w-full max-w-sm flex-col">
            <Select
                value={props.selectedWorkflowId}
                onChange={(event) => {
                    props.onSelectWorkflow(event.target.value);
                }}
                aria-label="Workflow"
            >
                {props.availableWorkflows.map((workflow) => (
                    <option key={workflow.workflowId} value={workflow.workflowId}>
                        {workflow.displayName}
                      </option>
                ))}
            </Select>
        </div>
    );
}

function formatLinkedRun(run: WorkflowVisualiserLinkedRun): string {
    return `${run.displayName} · ${run.status} · ${run.completedItems}/${run.totalItems}`;
}

function RunContextPanel(props: {
    readonly model: WorkflowVisualiserModel;
    readonly linkedRecoveryRuns: WorkflowVisualiserLinkedRun[];
    readonly selectedRunValue: string;
    readonly onSelectRun: (runSelection: string | null) => void;
    readonly retryState: WorkflowWorkspaceHeaderProps['retryState'];
    readonly retryFeedback: string | null;
}) {
    return (
        <div className="w-full min-w-[260px] xl:max-w-xl">
            {props.linkedRecoveryRuns.length > 0 ? (
                <div className="mb-2 space-y-1 text-xs text-green-500">
                    {props.linkedRecoveryRuns.map((run) => (
                        <div key={run.runId}>
                            Recovered by {formatLinkedRun(run)}
                        </div>
                    ))}
                </div>
            ) : null}
            <Select
                value={props.selectedRunValue}
                onChange={(event) => {
                    props.onSelectRun(event.target.value === WORKFLOW_DEFINITION_ONLY_RUN_ID ? WORKFLOW_DEFINITION_ONLY_RUN_ID : event.target.value || null);
                }}
                aria-label="Run context"
            >
                <option value={WORKFLOW_DEFINITION_ONLY_RUN_ID}>Definition only</option>
                {props.model.availableRuns.map((run) => (
                    <option key={run.runId} value={run.runId}>
                        {new Date(run.createdAt).toLocaleString()} · {run.status}
                    </option>
                ))}
            </Select>
            {props.retryState?.enabled ? (
                <Button
                    onClick={props.retryState.onRetry}
                    disabled={props.retryState.loading}
                    className="mt-3 w-full text-xs font-semibold uppercase tracking-wider"
                >
                    {getWorkflowWorkspaceRetryLabel(props.retryState.loading)}
                </Button>
            ) : null}
            {props.retryFeedback ? (
                <div className="mt-2 text-xs text-brand-accent">{props.retryFeedback}</div>
            ) : null}
        </div>
    );
}
