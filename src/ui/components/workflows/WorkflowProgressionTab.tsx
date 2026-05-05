import type React from 'react';
import type { WorkflowVisualiserAggregateCount, WorkflowVisualiserProgressionStage } from '@contracts/workflowVisualiser';

type WorkflowProgressionTabProps = {
    readonly stages: WorkflowVisualiserProgressionStage[];
    readonly onSelectDetail: (detailId: string) => void;
}

function getStatusClass(status: WorkflowVisualiserProgressionStage['status']): string {
    if (status === 'completed') {return 'border-emerald-700/60 bg-emerald-950/20 text-emerald-200';}
    if (status === 'running') {return 'border-cyan-700/60 bg-cyan-950/20 text-cyan-200';}
    if (status === 'failed') {return 'border-red-700/60 bg-red-950/20 text-red-200';}
    return 'border-gray-700 bg-[#0a0a0a] text-gray-300';
}

function formatAggregateCount(entry: WorkflowVisualiserAggregateCount): string {
    const noun = entry.totalItems === 1 ? entry.noun.singular : entry.noun.plural;
    return `${entry.completedItems}/${entry.totalItems} ${noun}`;
}

export const WorkflowProgressionTab: React.FC<WorkflowProgressionTabProps> = ({ stages, onSelectDetail }) => (
    <div className="grid gap-4 xl:grid-cols-3">
        {stages.map((stage, index) => (
            <button
                key={stage.id}
                onClick={() => onSelectDetail(stage.id)}
                className={`rounded-2xl border p-5 text-left transition-colors hover:border-cyan-500/40 ${getStatusClass(stage.status)}`}
            >
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-70">Stage {index + 1}</div>
                <h3 className="mt-3 cursor-help text-lg font-semibold" title={stage.description}>{stage.label}</h3>
                <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.14em] opacity-75">
                    <span>{stage.status}</span>
                    <span>{stage.aggregateCounts.map(formatAggregateCount).join(', ')}</span>
                    <span>{stage.failedItems} failed</span>
                </div>
            </button>
        ))}
    </div>
);
