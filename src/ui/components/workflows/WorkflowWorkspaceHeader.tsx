import type React from 'react';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import {
    WORKFLOW_DEFINITION_ONLY_RUN_ID,
    WORKFLOW_WORKSPACE_TABS,
    type WorkflowWorkspaceTabId,
} from './workflowWorkspaceModel';

interface WorkflowWorkspaceHeaderProps {
    model: WorkflowVisualiserModel;
    activeTab: WorkflowWorkspaceTabId;
    onSelectTab: (tabId: WorkflowWorkspaceTabId) => void;
    selectedRunValue: string;
    onSelectRun: (runSelection: string | null) => void;
}

export const WorkflowWorkspaceHeader: React.FC<WorkflowWorkspaceHeaderProps> = ({
    model,
    activeTab,
    onSelectTab,
    selectedRunValue,
    onSelectRun,
}) => (
    <header className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Workflow Visualiser</div>
                <h2 className="mt-2 text-2xl font-light text-gray-100">{model.displayName}</h2>
                <p className="mt-2 max-w-3xl text-sm text-gray-400">{model.tabs.overview.summary.description}</p>
            </div>

            <div className="min-w-[260px] rounded-xl border border-gray-800 bg-[#0a0a0a] p-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Run Context</div>
                <div className="mt-2 text-sm text-gray-200">
                    {model.selectedRun ? `${model.selectedRun.status} · ${model.selectedRun.completedItems}/${model.selectedRun.totalItems}` : 'Definition only'}
                </div>
                <select
                    value={selectedRunValue}
                    onChange={(event) => {
                        onSelectRun(event.target.value === WORKFLOW_DEFINITION_ONLY_RUN_ID ? WORKFLOW_DEFINITION_ONLY_RUN_ID : event.target.value || null);
                    }}
                    className="mt-3 w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2 text-sm text-gray-200 outline-none"
                >
                    <option value={WORKFLOW_DEFINITION_ONLY_RUN_ID}>Definition only</option>
                    {model.availableRuns.map((run) => (
                        <option key={run.runId} value={run.runId}>
                            {new Date(run.createdAt).toLocaleString()} · {run.status}
                        </option>
                    ))}
                </select>
            </div>
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
