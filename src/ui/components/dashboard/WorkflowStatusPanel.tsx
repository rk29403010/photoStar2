import type React from 'react';
import type { WorkflowStatusSnapshot } from '@contracts/jobs';

function formatCount(value: number) {
    return new Intl.NumberFormat().format(value);
}

function formatTimestamp(value: string | null) {
    if (!value) {
        return 'No runs yet';
    }
    return new Date(value).toLocaleString();
}

function SummaryCard({
    label,
    value,
    tone,
}: {
    readonly label: string;
    readonly value: number;
    readonly tone: string;
}) {
    return (
        <div className="rounded-lg border border-content/10 bg-surface p-4">
            <div className="text-xs uppercase tracking-widest text-content-secondary">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${tone}`}>{formatCount(value)}</div>
        </div>
    );
}

export const WorkflowStatusPanel: React.FC<{
    readonly snapshot: WorkflowStatusSnapshot | null;
    readonly loading?: boolean;
}> = ({ snapshot, loading }) => {
    if (!snapshot && !loading) {
        return (
            <section className="rounded-xl border border-content/10 bg-surface-secondary p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">Workflow Status</div>
                <p className="mt-3 text-sm text-content-secondary">No runtime workflow activity has been recorded yet.</p>
            </section>
        );
    }

    const totals = snapshot?.totals ?? {
        running: 0,
        completed: 0,
        failed: 0,
        totalRuns: 0,
    };
    const workflows = snapshot?.workflows ?? [];

    return (
        <section className="rounded-xl border border-content/10 bg-surface-secondary p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">Workflow Status</div>
                    <h3 className="mt-1 text-lg font-medium text-content">Runtime workflow coverage</h3>
                </div>
                <div className="text-xs uppercase tracking-widest text-content-secondary">
                    {snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString() : 'Loading'}
                </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
                <SummaryCard label="Running" value={totals.running} tone="text-cyan-500 font-bold" />
                <SummaryCard label="Completed" value={totals.completed} tone="text-emerald-500 font-bold" />
                <SummaryCard label="Failed" value={totals.failed} tone="text-rose-500 font-bold" />
                <SummaryCard label="Total Runs" value={totals.totalRuns} tone="text-content font-bold" />
            </div>

            <div className="mt-4 grid gap-3">
                {workflows.length === 0 ? (
                    <div className="rounded-lg border border-content/10 bg-surface p-4 text-sm text-content-secondary">
                        Workflow summaries will appear here after the first runtime run starts.
                    </div>
                ) : workflows.map((workflow) => (
                    <article key={workflow.workflowId} className="rounded-lg border border-content/10 bg-surface p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-content">{workflow.displayName}</div>
                                <div className="mt-1 text-xs text-content-secondary">
                                    Latest: {workflow.latestStatus ?? 'never run'}
                                </div>
                                <div className="mt-1 text-xs text-content-secondary/70">
                                    {formatTimestamp(workflow.latestCreatedAt)}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-content-secondary md:grid-cols-4">
                                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1">
                                    Running {workflow.running}
                                </span>
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1">
                                    Completed {workflow.completed}
                                </span>
                                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1">
                                    Failed {workflow.failed}
                                </span>
                                <span className="rounded-full border border-content/20 px-2 py-1">
                                    Total {workflow.totalRuns}
                                </span>
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
};
