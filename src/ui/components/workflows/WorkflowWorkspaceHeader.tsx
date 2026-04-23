import type React from 'react';
import type { WorkflowVisualiserLinkedRun, WorkflowVisualiserModel, WorkflowVisualiserWorkflowSummary } from '@contracts/workflowVisualiser';
import {
    getWorkflowWorkspaceRetryFeedback,
    getWorkflowWorkspaceRetryLabel,
    WORKFLOW_DEFINITION_ONLY_RUN_ID,
    WORKFLOW_WORKSPACE_TABS,
    type WorkflowWorkspaceTabId,
} from './workflowWorkspaceModel';

interface WorkflowWorkspaceHeaderProps {
    model: WorkflowVisualiserModel;
    selectedWorkflowId: string;
    onSelectWorkflow: (workflowId: string) => void;
    activeTab: WorkflowWorkspaceTabId;
    onSelectTab: (tabId: WorkflowWorkspaceTabId) => void;
    selectedRunValue: string;
    onSelectRun: (runSelection: string | null) => void;
    retryState?: {
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
        <header className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Workflow Visualiser</div>
                    <h2 className="mt-2 text-2xl font-light text-gray-100">{model.displayName}</h2>
                    <p className="mt-2 max-w-3xl text-sm text-gray-400">{model.tabs.overview.summary.description}</p>
                    <WorkflowSelector
                        availableWorkflows={model.availableWorkflows}
                        selectedWorkflowId={selectedWorkflowId}
                        onSelectWorkflow={onSelectWorkflow}
                    />
                </div>

                <RunContextPanel
                    model={model}
                    linkedRecoveryRuns={linkedRecoveryRuns}
                    selectedRunValue={selectedRunValue}
                    onSelectRun={onSelectRun}
                    retryState={retryState}
                    retryFeedback={retryFeedback}
                />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                {WORKFLOW_WORKSPACE_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onSelectTab(tab.id)}
                        className={`rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition-colors ${
                            activeTab === tab.id
                                ? 'border-cyan-500/40 bg-cyan-600/20 text-cyan-300'
                                : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </header>
    );
};

function WorkflowSelector(props: {
    availableWorkflows: WorkflowVisualiserWorkflowSummary[];
    selectedWorkflowId: string;
    onSelectWorkflow: (workflowId: string) => void;
}) {
    return (
        <label className="mt-4 flex max-w-sm flex-col gap-2 text-[11px] uppercase tracking-[0.24em] text-gray-500">
            Workflow
            <select
                value={props.selectedWorkflowId}
                onChange={(event) => {
                    props.onSelectWorkflow(event.target.value);
                }}
                className="rounded-lg border border-gray-700 bg-[#151515] px-3 py-2 text-sm normal-case tracking-normal text-gray-200 outline-none"
            >
                {props.availableWorkflows.map((workflow) => (
                    <option key={workflow.workflowId} value={workflow.workflowId}>
                        {workflow.displayName}
                    </option>
                ))}
            </select>
        </label>
    );
}

function formatLinkedRun(run: WorkflowVisualiserLinkedRun): string {
    return `${run.displayName} · ${run.status} · ${run.completedItems}/${run.totalItems}`;
}

function RunContextPanel(props: {
    model: WorkflowVisualiserModel;
    linkedRecoveryRuns: WorkflowVisualiserLinkedRun[];
    selectedRunValue: string;
    onSelectRun: (runSelection: string | null) => void;
    retryState: WorkflowWorkspaceHeaderProps['retryState'];
    retryFeedback: string | null;
}) {
    return (
        <div className="min-w-[260px] rounded-xl border border-gray-800 bg-[#0a0a0a] p-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Run Context</div>
            <div className="mt-2 text-sm text-gray-200">
                {props.model.selectedRun ? `${props.model.selectedRun.status} · ${props.model.selectedRun.completedItems}/${props.model.selectedRun.totalItems}` : 'Definition only'}
            </div>
            {props.linkedRecoveryRuns.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs text-emerald-200">
                    {props.linkedRecoveryRuns.map((run) => (
                        <div key={run.runId}>
                            Recovered by {formatLinkedRun(run)}
                        </div>
                    ))}
                </div>
            ) : null}
            <select
                value={props.selectedRunValue}
                onChange={(event) => {
                    props.onSelectRun(event.target.value === WORKFLOW_DEFINITION_ONLY_RUN_ID ? WORKFLOW_DEFINITION_ONLY_RUN_ID : event.target.value || null);
                }}
                className="mt-3 w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2 text-sm text-gray-200 outline-none"
            >
                <option value={WORKFLOW_DEFINITION_ONLY_RUN_ID}>Definition only</option>
                {props.model.availableRuns.map((run) => (
                    <option key={run.runId} value={run.runId}>
                        {new Date(run.createdAt).toLocaleString()} · {run.status}
                    </option>
                ))}
            </select>
            {props.retryState?.enabled ? (
                <button
                    onClick={props.retryState.onRetry}
                    disabled={props.retryState.loading}
                    className="mt-3 w-full rounded-lg border border-cyan-600/40 bg-cyan-600/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300 transition-colors hover:bg-cyan-600/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {getWorkflowWorkspaceRetryLabel(props.retryState.loading)}
                </button>
            ) : null}
            {props.retryFeedback ? (
                <div className="mt-2 text-xs text-cyan-200">{props.retryFeedback}</div>
            ) : null}
        </div>
    );
}
