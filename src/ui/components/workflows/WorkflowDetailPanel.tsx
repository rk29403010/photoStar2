import type React from 'react';
import type { WorkflowVisualiserAggregateCount, WorkflowVisualiserDetail } from '@contracts/workflowVisualiser';

interface WorkflowDetailPanelProps {
    detail: WorkflowVisualiserDetail | null;
    onClose: () => void;
}

function formatAggregateCount(entry: WorkflowVisualiserAggregateCount): string {
    const noun = entry.totalItems === 1 ? entry.noun.singular : entry.noun.plural;
    return `${entry.completedItems}/${entry.totalItems} ${noun}`;
}

export const WorkflowDetailPanel: React.FC<WorkflowDetailPanelProps> = ({ detail, onClose }) => {
    if (!detail) {
        return (
            <aside className="rounded-2xl border border-gray-800 bg-[#111111] p-5 text-sm text-gray-400">
                Select a stage or node to inspect it.
            </aside>
        );
    }

    return (
        <aside className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">{detail.kind}</div>
                    <h3 className="mt-2 text-lg font-semibold text-gray-100">{detail.label}</h3>
                </div>
                <button onClick={onClose} className="rounded-md border border-gray-700 px-2 py-1 text-xs uppercase tracking-[0.2em] text-gray-400">
                    Close
                </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-400">{detail.description}</p>
            <div className="mt-4 space-y-2 text-sm text-gray-300">
                <div>Status: {detail.status}</div>
                <div>Counts: {detail.aggregateCounts.map(formatAggregateCount).join(', ')}</div>
                <div>Total {detail.counts.totalItems === 1 ? detail.countNoun.singular : detail.countNoun.plural}: {detail.counts.totalItems}</div>
                <div>Failed: {detail.counts.failedItems}</div>
                <div>Upstream: {detail.upstreamIds.length > 0 ? detail.upstreamIds.join(', ') : 'none'}</div>
                <div>Downstream: {detail.downstreamIds.length > 0 ? detail.downstreamIds.join(', ') : 'none'}</div>
            </div>
        </aside>
    );
};
