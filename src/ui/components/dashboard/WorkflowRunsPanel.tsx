import type React from 'react';
import type { WorkflowRunListItem } from '@contracts/jobs';

function formatStatus(status: string): string {
    if (status === 'completed') {return 'Completed';}
    if (status === 'failed') {return 'Failed';}
    if (status === 'running') {return 'Running';}
    return status;
}

function formatCount(value: number): string {
    return new Intl.NumberFormat().format(value);
}

function getStepSummary(run: WorkflowRunListItem, nodeId: string) {
    return run.stepSummaries.find((step) => step.nodeId === nodeId);
}

function buildPrimarySummary(run: WorkflowRunListItem): string {
    if (run.workflowId !== 'folder_ingest_v1') {
        return `${formatStatus(run.status)} · ${formatCount(run.completedItems)}/${formatCount(run.totalItems)} items`;
    }

    const previewStep = getStepSummary(run, 'generate-previews');
    if (!previewStep) {
        return `${formatStatus(run.status)} · Preparing library`;
    }

    return `${formatStatus(run.status)} · ${formatCount(previewStep.totalItems)} files discovered`;
}

function buildSecondarySummary(run: WorkflowRunListItem): string | null {
    if (run.workflowId !== 'folder_ingest_v1') {
        return null;
    }

    const previewStep = getStepSummary(run, 'generate-previews');
    if (!previewStep) {
        return null;
    }

    return `${formatCount(previewStep.completedItems)}/${formatCount(previewStep.totalItems)} thumbnails generated`;
}

function buildEnrichmentSummary(run: WorkflowRunListItem): string[] {
    if (run.workflowId !== 'folder_ingest_v1') {
        return [];
    }

    const summaries: string[] = [];
    const faceStep = getStepSummary(run, 'detect-faces');
    const sensitiveStep = getStepSummary(run, 'detect-sensitive-content');
    const metadataStep = getStepSummary(run, 'generate-ai-metadata');

    if (faceStep && faceStep.totalItems > 0) {
        summaries.push(`${formatCount(faceStep.completedItems)}/${formatCount(faceStep.totalItems)} photos analysed`);
    }
    if (sensitiveStep && sensitiveStep.totalItems > 0) {
        summaries.push(`${formatCount(sensitiveStep.completedItems)}/${formatCount(sensitiveStep.totalItems)} sensitivity checks`);
    }
    if (metadataStep && metadataStep.totalItems > 0) {
        summaries.push(`${formatCount(metadataStep.completedItems)}/${formatCount(metadataStep.totalItems)} metadata passes`);
    }

    return summaries;
}

export const WorkflowRunsPanel: React.FC<{ readonly runs: WorkflowRunListItem[] }> = ({ runs }) => {
    if (runs.length === 0) {
        return (
            <section className="rounded-xl border border-content/10 bg-surface-secondary p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">Workflow Runs</div>
                <p className="mt-3 text-sm text-content-secondary">No workflow runs yet.</p>
            </section>
        );
    }

    return (
        <section className="rounded-xl border border-content/10 bg-surface-secondary p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">Workflow Runs</div>
                    <h3 className="mt-1 text-lg font-medium text-content">Recent runtime activity</h3>
                </div>
                <div className="text-xs uppercase tracking-widest text-content-secondary">{runs.length} runs</div>
            </div>

            <div className="mt-4 grid gap-3">
                {runs.map((run) => (
                    <article key={run.runId} className="rounded-lg border border-content/10 bg-surface p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-content">{run.displayName}</div>
                                <div className="mt-1 text-xs text-content-secondary">
                                    {buildPrimarySummary(run)}
                                </div>
                                {buildSecondarySummary(run) ? (
                                    <div className="mt-1 text-xs text-content-secondary/70">{buildSecondarySummary(run)}</div>
                                ) : null}
                            </div>
                            <div className="text-xs text-content-secondary/70">
                                {new Date(run.createdAt).toLocaleString()}
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {run.milestones.map((milestone) => (
                                <span key={milestone.milestoneId} className="rounded-full border border-content/20 px-2 py-1 text-xs text-content-secondary bg-surface-secondary">
                                    {milestone.label}: {formatStatus(milestone.status)}
                                </span>
                            ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-content-secondary/80">
                            <span>Mode: {String(run.parameters.aiMode ?? 'n/a')}</span>
                            <span>Traversal: {String(run.parameters.traversalMode ?? 'n/a')}</span>
                            <span>Failures: {run.failedItems}</span>
                        </div>

                        {buildEnrichmentSummary(run).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-content-secondary/60">
                                {buildEnrichmentSummary(run).map((summary) => (
                                    <span key={summary}>{summary}</span>
                                ))}
                            </div>
                        ) : null}
                    </article>
                ))}
            </div>
        </section>
    );
};
