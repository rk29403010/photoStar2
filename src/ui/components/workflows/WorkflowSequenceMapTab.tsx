import type React from 'react';
import { useMemo } from 'react';
import {
    Background,
    Controls,
    Handle,
    Position,
    ReactFlow,
    getSmoothStepPath,
    type EdgeProps,
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

function getStatusTone(status: WorkflowVisualiserStatus, isSelected: boolean, showRuntimeDetails: boolean): string {
    if (showRuntimeDetails) {
        let borderClass = 'border-gray-300';
        if (status === 'completed') {
            borderClass = 'border-emerald-800';
        } else if (status === 'failed') {
            borderClass = 'border-amber-500';
        } else if (status === 'running') {
            borderClass = 'border-cyan-600';
        }
        
        const selectionClass = isSelected
            ? 'ring-2 ring-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
            : '';
            
        return `bg-white text-black ${borderClass} ${selectionClass}`;
    }

    if (isSelected) {return 'border-amber-400 bg-amber-950/30 text-amber-50 ring-2 ring-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.3)]';}
    if (status === 'completed') {return 'border-emerald-700/60 bg-emerald-950/15 text-emerald-100';}
    if (status === 'running') {return 'border-cyan-700/60 bg-cyan-950/20 text-cyan-100';}
    if (status === 'failed') {return 'border-red-700/60 bg-red-950/20 text-red-100';}
    return 'border-content/10 bg-surface-secondary text-content';
}

function formatNodeCounts(data: SequenceWorkflowNodeData): string {
    const noun = data.totalItems === 1 ? data.countNoun.singular : data.countNoun.plural;
    return `${data.completedItems}/${data.totalItems} ${noun}`;
}

function getStatusEmoji(status: WorkflowVisualiserStatus): string {
    switch (status) {
        case 'completed': return '✅';
        case 'running': return '🌀';
        case 'failed': return '⚠️';
        case 'idle':
        default:
            return '⚪';
    }
}

function SequenceStageNode({ data, selected }: NodeProps<Node<SequenceStageNodeData>>) {
    return (
        <div className={`h-full border px-5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] ${getStatusTone(data.status, selected, data.showRuntimeDetails)}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="cursor-help text-lg font-semibold" title={data.description}>{data.label}</div>
                </div>
                {data.showRuntimeDetails ? (
                    <div className="text-sm">
                        {getStatusEmoji(data.status)}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function SequenceWorkflowNode({ data, selected }: NodeProps<Node<SequenceWorkflowNodeData>>) {
    let costElement = (
        <div className="text-xs font-semibold opacity-0 select-none">Placeholder cost</div>
    );
    if (data.totalEstimatedCost !== undefined) {
        costElement = (
            <div className="text-xs font-semibold text-amber-500">
                EST. COST: £{data.totalEstimatedCost.toFixed(4)}
            </div>
        );
    } else if (data.estimatedCostPerCall !== undefined) {
        costElement = (
            <div className="text-xs font-semibold text-amber-500/70">
                EST. COST: £{data.estimatedCostPerCall.toFixed(4)} / CALL
            </div>
        );
    }

    return (
        <>
            <Handle
                id={SEQUENCE_NODE_LEFT_HANDLE_ID}
                type="target"
                position={Position.Left}
                className="!h-2.5 !w-2.5 !border-none !bg-transparent !opacity-0"
            />
            <Handle
                id={SEQUENCE_NODE_RIGHT_HANDLE_ID}
                type="source"
                position={Position.Right}
                className="!h-2.5 !w-2.5 !border-none !bg-transparent !opacity-0"
            />
            <Handle
                id={SEQUENCE_NODE_TOP_HANDLE_ID}
                type="target"
                position={Position.Top}
                className="!h-2.5 !w-2.5 !border-none !bg-transparent !opacity-0"
            />
            <Handle
                id={SEQUENCE_NODE_BOTTOM_HANDLE_ID}
                type="source"
                position={Position.Bottom}
                className="!h-2.5 !w-2.5 !border-none !bg-transparent !opacity-0"
            />
            <div className={`h-full ${data.kind === 'control' ? 'rounded-none' : 'rounded-2xl'} border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.35)] flex flex-col justify-between ${getStatusTone(data.status, selected, data.showRuntimeDetails)}`}>
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold leading-5 line-clamp-2 pr-6 break-words flex-1 min-h-[2.5rem]">
                            {data.label}
                        </div>
                        <div className="w-6 h-6 flex items-start justify-end text-sm shrink-0">
                            {data.showRuntimeDetails ? getStatusEmoji(data.status) : null}
                        </div>
                    </div>
                </div>

                <div className="mt-auto space-y-1">
                    {data.showRuntimeDetails ? (
                        <div className="text-xs opacity-80">{formatNodeCounts(data)} • {data.failedItems} failed</div>
                    ) : (
                        <div className="text-xs opacity-0 select-none">Placeholder counts</div>
                    )}
                    
                    {costElement}
                </div>
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

function getCustomSmoothStepPath(sx: number, sy: number, tx: number, ty: number, clearanceY: number, gapX: number, borderRadius: number = 8): string {
    const r = borderRadius;
    let path = `M ${sx} ${sy}`;
    path += ` L ${sx} ${clearanceY - r}`;
    path += ` Q ${sx} ${clearanceY} ${sx + r} ${clearanceY}`;
    path += ` L ${gapX - r} ${clearanceY}`;
    if (ty < clearanceY) {
        path += ` Q ${gapX} ${clearanceY} ${gapX} ${clearanceY - r}`;
        path += ` L ${gapX} ${ty + r}`;
        path += ` Q ${gapX} ${ty} ${gapX + r} ${ty}`;
    } else {
        path += ` Q ${gapX} ${clearanceY} ${gapX} ${clearanceY + r}`;
        path += ` L ${gapX} ${ty - r}`;
        path += ` Q ${gapX} ${ty} ${gapX + r} ${ty}`;
    }
    path += ` L ${tx} ${ty}`;
    return path;
}

export function WorkflowEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
}: EdgeProps) {
    let edgePath = '';
    if (data && typeof data.clearanceY === 'number' && typeof data.gapX === 'number') {
        edgePath = getCustomSmoothStepPath(
            sourceX,
            sourceY,
            targetX,
            targetY,
            data.clearanceY,
            data.gapX,
            12
        );
    } else {
        const [path] = getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
        });
        edgePath = path;
    }
    return (
        <path
            id={id}
            style={style}
            className="react-flow__edge-path"
            d={edgePath}
            markerEnd={markerEnd}
        />
    );
}

const edgeTypes = {
    workflowEdge: WorkflowEdge,
};

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
    const stableEdgeTypes = useMemo(() => edgeTypes, []);
    const stageIdsByNodeId = useMemo(() => {
        return Object.fromEntries(sequenceMap.nodes.map((node) => [node.id, node.stageId]));
    }, [sequenceMap.nodes]);
    const stageBoxesById = useMemo(() => {
        return Object.fromEntries(sequenceMap.stageBoxes.map((stage) => [stage.id, stage]));
    }, [sequenceMap.stageBoxes]);
    const flowEdges = useMemo(() => buildWorkflowSequenceFlowEdges(edges, stageIdsByNodeId, stageBoxesById), [edges, stageIdsByNodeId, stageBoxesById]);
    const handleNodeClick: NodeMouseHandler<Node> = (_, node) => {
        onSelectDetail(node.id);
    };

    return (
        <div className="w-full h-full min-h-0 bg-surface relative" data-testid="rf__wrapper">
            <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={stableNodeTypes}
                edgeTypes={stableEdgeTypes}
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
                className="w-full h-full"
            >
                <Background color="currentColor" className="text-content/5" gap={20} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
};

const nodeTypes = {
    stageBox: SequenceStageNode,
    workflowNode: SequenceWorkflowNode,
};
