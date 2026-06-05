import type React from 'react';
import type { WorkflowVisualiserAggregateCount, WorkflowVisualiserProgressionStage } from '@contracts/workflowVisualiser';

type WorkflowProgressionTabProps = {
    readonly stages: WorkflowVisualiserProgressionStage[];
    readonly onSelectDetail: (detailId: string) => void;
}

function getStatusClass(status: WorkflowVisualiserProgressionStage['status']): string {
    if (status === 'completed') {return 'border-emerald-700/60 bg-emerald-950/25 text-emerald-200';}
    if (status === 'running') {return 'border-cyan-700/60 bg-cyan-950/25 text-cyan-200';}
    if (status === 'failed') {return 'border-red-700/60 bg-red-950/25 text-red-200';}
    return 'border-content/10 bg-surface-secondary text-content-secondary';
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
                className={`rounded-2xl border p-5 text-left transition-colors hover:border-brand-accent/40 ${getStatusClass(stage.status)}`}
            >
                <div className="text-xs font-semibold uppercase tracking-widest opacity-70">Stage {index + 1}</div>
                <h3 className="mt-3 cursor-help text-lg font-semibold" title={stage.description}>{stage.label}</h3>
                <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-widest opacity-75">
                    <span>{stage.status}</span>
                    <span>{stage.aggregateCounts.map(formatAggregateCount).join(', ')}</span>
                    <span>{stage.failedItems} failed</span>
                </div>
            </button>
        ))}
    </div>
);
