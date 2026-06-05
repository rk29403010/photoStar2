import type React from 'react';
import type { WorkflowVisualiserAggregateCount, WorkflowVisualiserDetail } from '@contracts/workflowVisualiser';

type WorkflowDetailPanelProps = {
    readonly detail: WorkflowVisualiserDetail | null;
    readonly onClose: () => void;
    readonly onSelectDetail: (id: string) => void;
    readonly showRuntimeDetails: boolean;
}

function formatAggregateCount(entry: WorkflowVisualiserAggregateCount): string {
    const noun = entry.totalItems === 1 ? entry.noun.singular : entry.noun.plural;
    return `${entry.completedItems}/${entry.totalItems} ${noun}`;
}

function buildRuntimeDetailRows(detail: WorkflowVisualiserDetail): string[] {
    const rows = [
        `Status: ${detail.status}`,
        `Counts: ${detail.aggregateCounts.map(formatAggregateCount).join(', ')}`,
        `Total ${detail.counts.totalItems === 1 ? detail.countNoun.singular : detail.countNoun.plural}: ${detail.counts.totalItems}`,
        `Failed: ${detail.counts.failedItems}`,
    ];

    if (detail.failedSubjects.length > 0) {
        rows.push(`Failed subjects: ${detail.failedSubjects.map((subject) => subject.originalPath ?? subject.label).join(', ')}`);
    }

    return rows;
}

function InteractiveIdList({ ids, onSelect }: { readonly ids: string[], readonly onSelect: (id: string) => void }) {
    if (ids.length === 0) {return <span>none</span>;}
    return (
        <span className="inline-flex flex-wrap gap-x-1">
            {ids.map((id, index) => (
                <span key={id} className="inline-flex items-center">
                    <button 
                        onClick={() => onSelect(id)}
                        className="font-mono text-xs text-brand-accent transition-colors hover:text-brand-accent-hover hover:underline"
                    >
                        {id}
                    </button>
                    {index < ids.length - 1 && <span className="text-content-secondary/60">,</span>}
                </span>
            ))}
        </span>
    );
}

export const WorkflowDetailPanel: React.FC<WorkflowDetailPanelProps> = ({ detail, onClose, onSelectDetail, showRuntimeDetails }) => {
    if (!detail) {
        return (
            <aside className="rounded-2xl border border-content/10 bg-surface-secondary p-5 text-sm text-content-secondary">
                Select a stage or node to inspect it.
            </aside>
        );
    }

    return (
        <aside className="rounded-2xl border border-content/10 bg-surface-secondary p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">{detail.kind}</div>
                    <h3 className="mt-2 text-lg font-semibold text-content">{detail.label}</h3>
                </div>
                <button onClick={onClose} className="rounded-md border border-content/20 px-2 py-1 text-xs uppercase tracking-widest text-content-secondary transition-colors hover:bg-surface-secondary hover:text-content">
                    Close
                </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-content-secondary">{detail.description}</p>
            <div className="mt-4 space-y-2 text-sm text-content-secondary">
                {detail.errorMessage && <div className="text-red-400">Error: {detail.errorMessage}</div>}
                {showRuntimeDetails ? buildRuntimeDetailRows(detail).map((row) => <div key={row}>{row}</div>) : null}
                <div className="flex items-baseline gap-2">
                    <span className="opacity-60">ID:</span>
                    <span className="font-mono text-xs text-brand-accent">{detail.id}</span>
                </div>
                {detail.moduleId && (
                    <div className="flex items-baseline gap-2">
                        <span className="opacity-60">Module:</span>
                        <span className="font-mono text-xs text-brand-accent">{detail.moduleId}</span>
                    </div>
                )}
                {detail.controlType && (
                    <div className="flex items-baseline gap-2">
                        <span className="opacity-60">Control:</span>
                        <span className="font-mono text-xs text-brand-accent">{detail.controlType}</span>
                    </div>
                )}
                <div className="flex items-baseline gap-2">
                    <span className="opacity-60">Upstream:</span>
                    <InteractiveIdList ids={detail.upstreamIds} onSelect={onSelectDetail} />
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="opacity-60">Downstream:</span>
                    <InteractiveIdList ids={detail.downstreamIds} onSelect={onSelectDetail} />
                </div>
            </div>
        </aside>
    );
};

