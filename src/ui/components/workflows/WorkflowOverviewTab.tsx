import type React from 'react';
import type {
    WorkflowVisualiserAggregateCount,
    WorkflowVisualiserLinkedRun,
    WorkflowVisualiserOverviewModel,
    WorkflowVisualiserRunSummary,
} from '@contracts/workflowVisualiser';

type WorkflowOverviewTabProps = {
    readonly overview: WorkflowVisualiserOverviewModel;
    readonly selectedRun: WorkflowVisualiserRunSummary | null;
}

function formatAggregateCount(entry: WorkflowVisualiserAggregateCount): string {
    const noun = entry.totalItems === 1 ? entry.noun.singular : entry.noun.plural;
    return `${entry.totalItems} ${noun}`;
}

function formatLinkedRun(run: WorkflowVisualiserLinkedRun): string {
    return `${run.displayName} · ${run.status} · ${run.completedItems}/${run.totalItems}`;
}

export const WorkflowOverviewTab: React.FC<WorkflowOverviewTabProps> = ({ overview, selectedRun }) => (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Summary</div>
            <h3 className="mt-3 text-xl font-medium text-gray-100">{overview.summary.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">{overview.summary.description}</p>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Run Snapshot</div>
            <div className="mt-3 space-y-2 text-sm text-gray-300">
                <div>Status: {selectedRun?.status ?? 'definition only'}</div>
                <div>Counts: {overview.aggregateCounts.length > 0 ? overview.aggregateCounts.map(formatAggregateCount).join(', ') : 'No runtime counts yet'}</div>
                <div>Completed: {selectedRun?.completedItems ?? 0}</div>
                <div>Failed: {selectedRun?.failedItems ?? 0}</div>
                {(selectedRun?.linkedRuns ?? []).map((run) => (
                    <div key={run.runId}>
                        {run.relationship === 'recovery' ? 'Recovery:' : 'Source:'} {formatLinkedRun(run)}
                    </div>
                ))}
            </div>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-[#111111] p-5 xl:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Milestones</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {overview.milestones.map((milestone) => (
                    <article key={milestone.milestoneId} className="rounded-xl border border-gray-800 bg-[#0a0a0a] p-4">
                        <div className="text-sm font-semibold text-gray-100">{milestone.label}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-500">{milestone.status}</div>
                    </article>
                ))}
            </div>
        </section>
    </div>
);
