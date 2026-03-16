import type React from 'react';
import type { WorkflowVisualiserGraphEdge, WorkflowVisualiserGraphNode } from '@contracts/workflowVisualiser';

interface WorkflowRuntimeGraphTabProps {
    nodes: WorkflowVisualiserGraphNode[];
    edges: WorkflowVisualiserGraphEdge[];
    onSelectDetail: (detailId: string) => void;
}

function getNodeTone(status: WorkflowVisualiserGraphNode['status']): string {
    if (status === 'completed') {return 'border-emerald-700/60 bg-emerald-950/15';}
    if (status === 'running') {return 'border-cyan-700/60 bg-cyan-950/15';}
    if (status === 'failed') {return 'border-red-700/60 bg-red-950/15';}
    return 'border-gray-700 bg-[#0a0a0a]';
}

function formatNodeCounts(node: WorkflowVisualiserGraphNode): string {
    const noun = node.totalItems === 1 ? node.countNoun.singular : node.countNoun.plural;
    return `${node.completedItems}/${node.totalItems} ${noun}`;
}

export const WorkflowRuntimeGraphTab: React.FC<WorkflowRuntimeGraphTabProps> = ({ nodes, edges, onSelectDetail }) => (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Runtime Graph</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {nodes.map((node) => (
                    <button
                        key={node.id}
                        onClick={() => onSelectDetail(node.id)}
                        className={`rounded-xl border p-4 text-left transition-colors hover:border-cyan-500/40 ${getNodeTone(node.status)}`}
                    >
                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">{node.kind}</div>
                        <div className="mt-2 text-sm font-semibold text-gray-100">{node.label}</div>
                        <div className="mt-2 text-xs text-gray-400">{formatNodeCounts(node)}</div>
                        <div className="mt-1 text-xs text-gray-500">{node.upstreamIds.length} upstream · {node.downstreamIds.length} downstream</div>
                    </button>
                ))}
            </div>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Connections</div>
            <div className="mt-4 space-y-2 text-sm text-gray-300">
                {edges.map((edge) => (
                    <div key={edge.id} className="rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-2">
                        {edge.source} {'->'} {edge.target}
                    </div>
                ))}
            </div>
        </section>
    </div>
);
