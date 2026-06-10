import type {
    WorkflowVisualiserGraphEdge,
    WorkflowVisualiserGraphNode,
    WorkflowVisualiserProgressionStage,
    WorkflowVisualiserStatus,
} from '@contracts/workflowVisualiser';

const STAGE_WIDTH = 320;
const STAGE_PADDING_X = 24;
const STAGE_HEADER_TOP = 20;
const STAGE_CONTENT_TOP = 96;
const STAGE_PADDING_BOTTOM = 28;
const STAGE_GAP_X = 56;
const NODE_WIDTH = 248;
const NODE_MAX_WIDTH = 360;
const NODE_HEIGHT = 148;
const NODE_GAP_X = 28;
const NODE_GAP_Y = 80;

export type WorkflowSequenceMapStageBox = {
    id: string;
    label: string;
    description: string;
    status: WorkflowVisualiserStatus;
    nodeIds: string[];
    position: {
        x: number;
        y: number;
    };
    size: {
        width: number;
        height: number;
    };
    headerTop: number;
    contentTop: number;
}

export type WorkflowSequenceMapNode = {
    id: string;
    label: string;
    kind: WorkflowVisualiserGraphNode['kind'];
    status: WorkflowVisualiserStatus;
    stageId: string;
    position: {
        x: number;
        y: number;
    };
    size: {
        width: number;
        height: number;
    };
    totalItems: number;
    completedItems: number;
    failedItems: number;
    countNoun: WorkflowVisualiserGraphNode['countNoun'];
    estimatedCostPerCall?: number;
    totalEstimatedCost?: number;
}

export type WorkflowSequenceMapEdge = WorkflowVisualiserGraphEdge;

export type WorkflowSequenceMap = {
    stageOrder: string[];
    stageBoxes: WorkflowSequenceMapStageBox[];
    nodes: WorkflowSequenceMapNode[];
    edges: WorkflowSequenceMapEdge[];
}

function getNodeHeight(showRuntimeDetails: boolean): number {
    return showRuntimeDetails ? NODE_HEIGHT : 96;
}

function getNodeWidth(node: WorkflowVisualiserGraphNode, showRuntimeDetails: boolean): number {
    const noun = node.totalItems === 1 ? node.countNoun.singular : node.countNoun.plural;
    const runtimeSummary = `${node.status} ${node.completedItems}/${node.totalItems} ${noun} ${node.failedItems} failed`;
    const widestLabelLength = Math.max(
        node.label.length,
        showRuntimeDetails ? runtimeSummary.length : 0,
    );

    return Math.min(
        NODE_MAX_WIDTH,
        Math.max(NODE_WIDTH, 48 + (widestLabelLength * 7)),
    );
}

function createFallbackStage(nodeIds: string[]): WorkflowVisualiserProgressionStage {
    return {
        id: 'runtime-ungrouped',
        label: 'Other Runtime Nodes',
        description: 'Nodes that are not mapped to a named progression stage yet.',
        status: 'idle',
        nodeIds,
        totalItems: 0,
        completedItems: 0,
        failedItems: 0,
        countNoun: { singular: 'item', plural: 'items' },
        aggregateCounts: [],
    };
}

function indexNodesByStage(stages: WorkflowVisualiserProgressionStage[], nodes: WorkflowVisualiserGraphNode[]) {
    const stageIdsByNode = new Map<string, string>();
    for (const stage of stages) {
        for (const nodeId of stage.nodeIds) {
            stageIdsByNode.set(nodeId, stage.id);
        }
    }

    const unmappedNodeIds = nodes
        .map((node) => node.id)
        .filter((nodeId) => !stageIdsByNode.has(nodeId));

    const effectiveStages = unmappedNodeIds.length > 0
        ? [...stages, createFallbackStage(unmappedNodeIds)]
        : stages;

    const nodesByStage = new Map<string, WorkflowVisualiserGraphNode[]>();
    for (const stage of effectiveStages) {
        nodesByStage.set(stage.id, []);
    }

    for (const node of nodes) {
        const stageId = stageIdsByNode.get(node.id) ?? 'runtime-ungrouped';
        const stageNodes = nodesByStage.get(stageId) ?? [];
        stageNodes.push(node);
        nodesByStage.set(stageId, stageNodes);
    }

    return { effectiveStages, nodesByStage };
}

function getStageHeight(nodeCount: number, nodeHeight: number): number {
    if (nodeCount === 0) {
        return STAGE_CONTENT_TOP + STAGE_PADDING_BOTTOM + nodeHeight;
    }

    return STAGE_CONTENT_TOP + STAGE_PADDING_BOTTOM + (nodeCount * nodeHeight) + ((nodeCount - 1) * NODE_GAP_Y);
}


function computeRows(nodes: WorkflowVisualiserGraphNode[], adj: Map<string, string[]>, revAdj: Map<string, string[]>, nodesById: Map<string, WorkflowVisualiserGraphNode>): Map<string, number> {
    const rows = new Map<string, number>();
    const queue = nodes.filter(n => (revAdj.get(n.id)?.length ?? 0) === 0);
    const rowQueue = [...queue];
    const processed = new Set<string>();

    while (rowQueue.length > 0) {
        const node = rowQueue.shift()!;
        if (processed.has(node.id)) {continue;}
        
        const upstreams = revAdj.get(node.id) ?? [];
        if (upstreams.every(u => rows.has(u))) {
            const row = upstreams.reduce((max, u) => Math.max(max, rows.get(u)! + 1), 0);
            rows.set(node.id, row);
            processed.add(node.id);
            (adj.get(node.id) ?? []).forEach(d => rowQueue.push(nodesById.get(d)!));
        } else {
            rowQueue.push(node);
        }
    }
    return rows;
}

type ColumnState = {
    columns: Map<string, number>;
    nextAvailableCol: number;
    visited: Set<string>;
    adj: Map<string, string[]>;
}

function assignColRecursive(nodeId: string, col: number, state: ColumnState) {
    if (state.visited.has(nodeId)) {return;}
    state.visited.add(nodeId);
    state.columns.set(nodeId, col);

    const children = state.adj.get(nodeId) ?? [];
    children.forEach((childId, idx) => {
        if (idx === 0) {
            assignColRecursive(childId, col, state);
        } else {
            state.nextAvailableCol++;
            assignColRecursive(childId, state.nextAvailableCol, state);
        }
    });
}

function computeColumns(nodes: WorkflowVisualiserGraphNode[], adj: Map<string, string[]>, revAdj: Map<string, string[]>): Map<string, number> {
    const state: ColumnState = {
        columns: new Map(),
        nextAvailableCol: 0,
        visited: new Set(),
        adj,
    };

    const entries = nodes.filter(n => (revAdj.get(n.id)?.length ?? 0) === 0);
    entries.forEach(entry => {
        assignColRecursive(entry.id, state.nextAvailableCol, state);
        state.nextAvailableCol++;
    });

    return state.columns;
}

function buildStageLevels(nodes: WorkflowVisualiserGraphNode[], edges: WorkflowVisualiserGraphEdge[]): (WorkflowVisualiserGraphNode | undefined)[][] {
    const nodesById = new Map(nodes.map(n => [n.id, n]));
    const internalEdges = edges.filter(e => nodesById.has(e.source) && nodesById.has(e.target));
    
    const adj = new Map<string, string[]>();
    const revAdj = new Map<string, string[]>();
    for (const node of nodes) {
        adj.set(node.id, []);
        revAdj.set(node.id, []);
    }
    for (const edge of internalEdges) {
        adj.get(edge.source)?.push(edge.target);
        revAdj.get(edge.target)?.push(edge.source);
    }

    const rows = computeRows(nodes, adj, revAdj, nodesById);
    const columns = computeColumns(nodes, adj, revAdj);

    const grid: (WorkflowVisualiserGraphNode | undefined)[][] = [];
    nodes.forEach(node => {
        const r = rows.get(node.id) ?? 0;
        const c = columns.get(node.id) ?? 0;
        if (!grid[r]) {grid[r] = [];}
        grid[r][c] = node;
    });

    return grid;
}

function getStageNodeWidth(levels: (WorkflowVisualiserGraphNode | undefined)[][], showRuntimeDetails: boolean): number {
    const allNodes = levels.flat().filter((n): n is WorkflowVisualiserGraphNode => n !== undefined);
    return Math.max(
        NODE_WIDTH,
        ...allNodes.map((node) => getNodeWidth(node, showRuntimeDetails)),
    );
}

function getStageWidth(levels: (WorkflowVisualiserGraphNode | undefined)[][], nodeWidth: number): number {
    const widestLevelCount = Math.max(1, ...levels.map((level) => level.length));
    return Math.max(
        STAGE_WIDTH,
        (STAGE_PADDING_X * 2) + (widestLevelCount * nodeWidth) + ((widestLevelCount - 1) * NODE_GAP_X),
    );
}

export function buildWorkflowSequenceMap(params: {
    stages: WorkflowVisualiserProgressionStage[];
    nodes: WorkflowVisualiserGraphNode[];
    edges: WorkflowVisualiserGraphEdge[];
    showRuntimeDetails?: boolean;
}): WorkflowSequenceMap {
    const { effectiveStages, nodesByStage } = indexNodesByStage(params.stages, params.nodes);
    const stageBoxes: WorkflowSequenceMapStageBox[] = [];
    const sequenceNodes: WorkflowSequenceMapNode[] = [];
    const nodeHeight = getNodeHeight(params.showRuntimeDetails !== false);

    effectiveStages.forEach((stage, stageIndex) => {
        const stageNodes = nodesByStage.get(stage.id) ?? [];
        const stageLevels = buildStageLevels(stageNodes, params.edges);
        const stageNodeWidth = getStageNodeWidth(stageLevels, params.showRuntimeDetails !== false);
        const stageWidth = getStageWidth(stageLevels, stageNodeWidth);
        const previousStage = stageBoxes[stageIndex - 1];
        const stageX = previousStage
            ? previousStage.position.x + previousStage.size.width + STAGE_GAP_X
            : 40;
        const stageY = 0;

        stageBoxes.push({
            id: stage.id,
            label: stage.label,
            description: stage.description,
            status: stage.status,
            nodeIds: stage.nodeIds,
            position: { x: stageX, y: stageY },
            size: {
                width: stageWidth,
                height: getStageHeight(stageLevels.length, nodeHeight),
            },
            headerTop: STAGE_HEADER_TOP,
            contentTop: STAGE_CONTENT_TOP,
        });

        stageLevels.forEach((levelNodes, levelIndex) => {
            levelNodes.forEach((node, levelColumnIndex) => {
                if (!node) {return;}
                sequenceNodes.push({
                    id: node.id,
                    label: node.label,
                    kind: node.kind,
                    status: node.status,
                    stageId: stage.id,
                    position: {
                        x: stageX + STAGE_PADDING_X + (levelColumnIndex * (stageNodeWidth + NODE_GAP_X)),
                        y: stageY + STAGE_CONTENT_TOP + (levelIndex * (nodeHeight + NODE_GAP_Y)),
                    },
                    size: {
                        width: stageNodeWidth,
                        height: nodeHeight,
                    },
                    totalItems: node.totalItems,
                    completedItems: node.completedItems,
                    failedItems: node.failedItems,
                    countNoun: node.countNoun,
                    estimatedCostPerCall: node.estimatedCostPerCall,
                    totalEstimatedCost: node.totalEstimatedCost,
                });
            });
        });
    });

    return {
        stageOrder: effectiveStages.map((stage) => stage.id),
        stageBoxes,
        nodes: sequenceNodes,
        edges: [...params.edges],
    };
}
