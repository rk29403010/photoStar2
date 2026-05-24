import type React from 'react';
import { useMemo } from 'react';
import {
    Background,
    Controls,
    Handle,
    Position,
    ReactFlow,
    type FitViewOptions,
    type Node,
    type NodeMouseHandler,
    type NodeProps,
    type Viewport,
} from '@xyflow/react';
import type {
    WorkflowVisualiserGraphEdge,
    WorkflowVisualiserGraphNode,
    WorkflowVisualiserProgressionStage,
    WorkflowVisualiserStatus,
} from '@contracts/workflowVisualiser';
import { buildWorkflowSequenceMap } from './workflowSequenceMapModel';
import {
    buildWorkflowSequenceFlowEdges,
    SEQUENCE_NODE_BOTTOM_HANDLE_ID,
    SEQUENCE_NODE_LEFT_HANDLE_ID,
    SEQUENCE_NODE_RIGHT_HANDLE_ID,
    SEQUENCE_NODE_TOP_HANDLE_ID,
} from './workflowSequenceFlowModel';

const SEQUENCE_MAP_FIT_VIEW_OPTIONS: FitViewOptions = {
    padding: 0.12,
    minZoom: 0.35,
    maxZoom: 1,
};

const SEQUENCE_MAP_PRO_OPTIONS = { hideAttribution: true } as const;
const SEQUENCE_MAP_DEFAULT_EDGE_OPTIONS = { zIndex: 4 } as const;

type WorkflowSequenceMapTabProps = {
    readonly stages: WorkflowVisualiserProgressionStage[];
    readonly nodes: WorkflowVisualiserGraphNode[];
    readonly edges: WorkflowVisualiserGraphEdge[];
    readonly onSelectDetail: (detailId: string) => void;
    readonly viewport: Viewport | null;
    readonly shouldFitViewport: boolean;
    readonly onViewportChange: (viewport: Viewport) => void;
    readonly showRuntimeDetails: boolean;
    readonly selectedDetailId: string | null;
}

type SequenceStageNodeData = {
    label: string;
    description: string;
    status: WorkflowVisualiserStatus;
    showRuntimeDetails: boolean;
} & Record<string, unknown>

type SequenceWorkflowNodeData = {
    label: string;
    kind: WorkflowVisualiserGraphNode['kind'];
    status: WorkflowVisualiserStatus;
    totalItems: number;
    completedItems: number;
    failedItems: number;
    countNoun: WorkflowVisualiserGraphNode['countNoun'];
    showRuntimeDetails: boolean;
    estimatedCostPerCall?: number;
    totalEstimatedCost?: number;
} & Record<string, unknown>

function getStatusTone(status: WorkflowVisualiserStatus, isSelected: boolean): string {
    if (isSelected) {return 'border-amber-400 bg-amber-950/30 text-amber-50 ring-2 ring-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.3)]';}
    if (status === 'completed') {return 'border-emerald-700/60 bg-emerald-950/15 text-emerald-100';}
    if (status === 'running') {return 'border-cyan-700/60 bg-cyan-950/20 text-cyan-100';}
    if (status === 'failed') {return 'border-red-700/60 bg-red-950/20 text-red-100';}
    return 'border-gray-700 bg-[#111111] text-gray-200';
}

function formatNodeCounts(data: SequenceWorkflowNodeData): string {
    const noun = data.totalItems === 1 ? data.countNoun.singular : data.countNoun.plural;
    return `${data.completedItems}/${data.totalItems} ${noun}`;
}

function SequenceStageNode({ data, selected }: NodeProps<Node<SequenceStageNodeData>>) {
    return (
        <div className={`h-full border px-5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] ${getStatusTone(data.status, selected)}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="cursor-help text-lg font-semibold" title={data.description}>{data.label}</div>
                </div>
                {data.showRuntimeDetails ? (
                    <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] opacity-80">
                        {data.status}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function SequenceWorkflowNode({ data, selected }: NodeProps<Node<SequenceWorkflowNodeData>>) {
    return (
        <>
            <Handle
                id={SEQUENCE_NODE_LEFT_HANDLE_ID}
                type="target"
                position={Position.Left}
                style={{ width: 10, height: 10, opacity: 0, border: 'none', background: 'transparent' }}
            />
            <Handle
                id={SEQUENCE_NODE_RIGHT_HANDLE_ID}
                type="source"
                position={Position.Right}
                style={{ width: 10, height: 10, opacity: 0, border: 'none', background: 'transparent' }}
            />
            <Handle
                id={SEQUENCE_NODE_TOP_HANDLE_ID}
                type="target"
                position={Position.Top}
                style={{ width: 10, height: 10, opacity: 0, border: 'none', background: 'transparent' }}
            />
            <Handle
                id={SEQUENCE_NODE_BOTTOM_HANDLE_ID}
                type="source"
                position={Position.Bottom}
                style={{ width: 10, height: 10, opacity: 0, border: 'none', background: 'transparent' }}
            />
            <div className={`h-full rounded-2xl border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.35)] ${getStatusTone(data.status, selected)}`}>
                {data.showRuntimeDetails ? (
                    <div className="flex min-h-6 items-start justify-end">
                        <div className="inline-flex rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                            {data.status}
                        </div>
                    </div>
                ) : null}
                <div className={data.showRuntimeDetails ? 'mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] opacity-60' : 'text-[10px] font-semibold uppercase tracking-[0.22em] opacity-60'}>
                    {data.kind}
                </div>
                <div className="mt-2 break-words text-sm font-semibold leading-5">{data.label}</div>
                {data.showRuntimeDetails ? (
                    <div className="mt-4 text-xs opacity-80">{formatNodeCounts(data)} • {data.failedItems} failed</div>
                ) : null}
                {data.totalEstimatedCost !== undefined && (
                    <div className="mt-2 text-[10px] font-semibold text-amber-500">
                        EST. COST: £{data.totalEstimatedCost.toFixed(4)}
                    </div>
                )}
                {data.totalEstimatedCost === undefined && data.estimatedCostPerCall !== undefined && (
                    <div className="mt-2 text-[10px] font-semibold text-amber-500/70">
                        EST. COST: £{data.estimatedCostPerCall.toFixed(4)} / CALL
                    </div>
                )}
            </div>
        </>
    );
}

function buildReactFlowNodes(params: {
    stages: WorkflowVisualiserProgressionStage[];
    nodes: WorkflowVisualiserGraphNode[];
    edges: WorkflowVisualiserGraphEdge[];
    showRuntimeDetails: boolean;
    selectedDetailId: string | null;
}): Array<Node<SequenceStageNodeData | SequenceWorkflowNodeData>> {
    const sequenceMap = buildWorkflowSequenceMap(params);
    const stageById = new Map(sequenceMap.stageBoxes.map((stage) => [stage.id, stage]));

    const stageNodes: Array<Node<SequenceStageNodeData>> = sequenceMap.stageBoxes.map((stage) => ({
        id: stage.id,
        type: 'stageBox',
        position: stage.position,
        draggable: false,
        selectable: true,
        data: {
            label: stage.label,
            description: stage.description,
            status: stage.status,
            showRuntimeDetails: params.showRuntimeDetails,
        },
        selected: stage.id === params.selectedDetailId,
        style: {
            width: stage.size.width,
            height: stage.size.height,
            background: 'transparent',
            border: 'none',
        },
    }));

    const workflowNodes: Array<Node<SequenceWorkflowNodeData>> = sequenceMap.nodes.map((node) => {
        const stage = stageById.get(node.stageId);
        return {
            id: node.id,
            type: 'workflowNode',
            parentId: node.stageId,
            extent: 'parent',
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            position: {
                x: node.position.x - (stage?.position.x ?? 0),
                y: node.position.y - (stage?.position.y ?? 0),
            },
            draggable: false,
            selectable: true,
            data: {
                label: node.label,
                kind: node.kind,
                status: node.status,
                totalItems: node.totalItems,
                completedItems: node.completedItems,
                failedItems: node.failedItems,
                countNoun: node.countNoun,
                showRuntimeDetails: params.showRuntimeDetails,
                estimatedCostPerCall: node.estimatedCostPerCall,
                totalEstimatedCost: node.totalEstimatedCost,
            },
            selected: node.id === params.selectedDetailId,
            style: {
                width: node.size.width,
                height: node.size.height,
                background: 'transparent',
                border: 'none',
            },
        };
    });

    return [...stageNodes, ...workflowNodes];
}

export const WorkflowSequenceMapTab: React.FC<WorkflowSequenceMapTabProps> = ({
    stages,
    nodes,
    edges,
    onSelectDetail,
    viewport,
    shouldFitViewport,
    onViewportChange,
    showRuntimeDetails,
    selectedDetailId,
}) => {
    const sequenceMap = useMemo(() => buildWorkflowSequenceMap({ stages, nodes, edges, showRuntimeDetails }), [edges, nodes, showRuntimeDetails, stages]);
    const flowNodes = useMemo(() => buildReactFlowNodes({ stages, nodes, edges, showRuntimeDetails, selectedDetailId }), [edges, nodes, showRuntimeDetails, stages, selectedDetailId]);
    const stableNodeTypes = useMemo(() => nodeTypes, []);
    const stageIdsByNodeId = useMemo(() => {
        return Object.fromEntries(sequenceMap.nodes.map((node) => [node.id, node.stageId]));
    }, [sequenceMap.nodes]);
    const flowEdges = useMemo(() => buildWorkflowSequenceFlowEdges(edges, stageIdsByNodeId), [edges, stageIdsByNodeId]);
    const handleNodeClick: NodeMouseHandler<Node> = (_, node) => {
        onSelectDetail(node.id);
    };

    return (
        <section className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Sequence Map</div>
                    <div className="mt-2 text-sm text-gray-300">
                        Nodes are laid out in run order, with stage containers around them and arrows preserving runtime relationships.
                    </div>
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Pan, zoom, and select a stage or node for details
                </div>
            </div>

            <div className="mt-5 h-[720px] overflow-hidden rounded-2xl border border-gray-800 bg-[#0a0a0a]">
                <ReactFlow
                    nodes={flowNodes}
                    edges={flowEdges}
                    nodeTypes={stableNodeTypes}
                    fitView={shouldFitViewport}
                    defaultViewport={viewport ?? { x: 24, y: 16, zoom: 1 }}
                    fitViewOptions={SEQUENCE_MAP_FIT_VIEW_OPTIONS}
                    minZoom={0.35}
                    maxZoom={1.5}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable
                    onNodeClick={handleNodeClick}
                    onMoveEnd={(_, nextViewport) => {
                        onViewportChange(nextViewport);
                    }}
                    proOptions={SEQUENCE_MAP_PRO_OPTIONS}
                    defaultEdgeOptions={SEQUENCE_MAP_DEFAULT_EDGE_OPTIONS}
                >
                    <Background color="#1f2937" gap={20} size={1} />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>
        </section>
    );
};

const nodeTypes = {
    stageBox: SequenceStageNode,
    workflowNode: SequenceWorkflowNode,
};
