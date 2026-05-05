import type React from 'react';
import type { WorkflowVisualiserAggregateCount, WorkflowVisualiserDetail } from '@contracts/workflowVisualiser';

type WorkflowDetailPanelProps = {
    readonly detail: WorkflowVisualiserDetail | null;
    readonly onClose: () => void;
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

export const WorkflowDetailPanel: React.FC<WorkflowDetailPanelProps> = ({ detail, onClose, showRuntimeDetails }) => {
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
                {detail.errorMessage && <div>Error: {detail.errorMessage}</div>}
                {showRuntimeDetails ? buildRuntimeDetailRows(detail).map((row) => <div key={row}>{row}</div>) : null}
                <div>Upstream: {detail.upstreamIds.length > 0 ? detail.upstreamIds.join(', ') : 'none'}</div>
                <div>Downstream: {detail.downstreamIds.length > 0 ? detail.downstreamIds.join(', ') : 'none'}</div>
            </div>
        </aside>
    );
};
