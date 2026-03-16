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

interface WorkflowSequenceMapTabProps {
    stages: WorkflowVisualiserProgressionStage[];
    nodes: WorkflowVisualiserGraphNode[];
    edges: WorkflowVisualiserGraphEdge[];
    onSelectDetail: (detailId: string) => void;
    viewport: Viewport | null;
    shouldFitViewport: boolean;
    onViewportChange: (viewport: Viewport) => void;
}

interface SequenceStageNodeData extends Record<string, unknown> {
    label: string;
    description: string;
    status: WorkflowVisualiserStatus;
}

interface SequenceWorkflowNodeData extends Record<string, unknown> {
    label: string;
    kind: WorkflowVisualiserGraphNode['kind'];
    status: WorkflowVisualiserStatus;
    totalItems: number;
    completedItems: number;
    failedItems: number;
    countNoun: WorkflowVisualiserGraphNode['countNoun'];
}

function getStatusTone(status: WorkflowVisualiserStatus): string {
    if (status === 'completed') {return 'border-emerald-700/60 bg-emerald-950/15 text-emerald-100';}
    if (status === 'running') {return 'border-cyan-700/60 bg-cyan-950/20 text-cyan-100';}
    if (status === 'failed') {return 'border-red-700/60 bg-red-950/20 text-red-100';}
    return 'border-gray-700 bg-[#111111] text-gray-200';
}

function formatNodeCounts(data: SequenceWorkflowNodeData): string {
    const noun = data.totalItems === 1 ? data.countNoun.singular : data.countNoun.plural;
    return `${data.completedItems}/${data.totalItems} ${noun}`;
}

function SequenceStageNode({ data }: NodeProps<Node<SequenceStageNodeData>>) {
    return (
        <div className={`h-full border px-5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] ${getStatusTone(data.status)}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-lg font-semibold">{data.label}</div>
                </div>
                <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] opacity-80">
                    {data.status}
                </div>
            </div>
            <p className="mt-2 max-w-[220px] text-xs leading-5 opacity-75">{data.description}</p>
        </div>
    );
}

function SequenceWorkflowNode({ data }: NodeProps<Node<SequenceWorkflowNodeData>>) {
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
            <div className={`h-full rounded-2xl border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.35)] ${getStatusTone(data.status)}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-60">{data.kind}</div>
                        <div className="mt-2 text-sm font-semibold leading-5">{data.label}</div>
                    </div>
                    <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                        {data.status}
                    </div>
                </div>
                <div className="mt-4 text-xs opacity-80">{formatNodeCounts(data)}</div>
                <div className="mt-1 text-xs opacity-60">{data.failedItems} failed</div>
            </div>
        </>
    );
}

function buildReactFlowNodes(params: {
    stages: WorkflowVisualiserProgressionStage[];
    nodes: WorkflowVisualiserGraphNode[];
    edges: WorkflowVisualiserGraphEdge[];
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
        },
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
            },
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
}) => {
    const sequenceMap = useMemo(() => buildWorkflowSequenceMap({ stages, nodes, edges }), [edges, nodes, stages]);
    const flowNodes = useMemo(() => buildReactFlowNodes({ stages, nodes, edges }), [edges, nodes, stages]);
    const stageIdsByNodeId = useMemo(() => {
        return Object.fromEntries(sequenceMap.nodes.map((node) => [node.id, node.stageId]));
    }, [sequenceMap.nodes]);
    const flowEdges = useMemo(() => buildWorkflowSequenceFlowEdges(edges, stageIdsByNodeId), [edges, stageIdsByNodeId]);
    const handleNodeClick: NodeMouseHandler<Node> = (_, node) => {
        onSelectDetail(node.id);
    };
    const fitViewOptions: FitViewOptions = {
        padding: 0.08,
        minZoom: 0.95,
        maxZoom: 1.1,
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
                    nodeTypes={nodeTypes}
                    fitView={shouldFitViewport}
                    defaultViewport={viewport ?? { x: 24, y: 16, zoom: 1 }}
                    fitViewOptions={fitViewOptions}
                    minZoom={0.35}
                    maxZoom={1.5}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable
                    onNodeClick={handleNodeClick}
                    onMoveEnd={(_, nextViewport) => {
                        onViewportChange(nextViewport);
                    }}
                    proOptions={{ hideAttribution: true }}
                    defaultEdgeOptions={{ zIndex: 4 }}
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
