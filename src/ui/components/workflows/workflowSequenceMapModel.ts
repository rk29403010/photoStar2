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
const NODE_GAP_Y = 56;

export interface WorkflowSequenceMapStageBox {
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

export interface WorkflowSequenceMapNode {
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
}

export type WorkflowSequenceMapEdge = WorkflowVisualiserGraphEdge;

export interface WorkflowSequenceMap {
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

function createOrderIndex(nodes: WorkflowVisualiserGraphNode[]): Map<string, number> {
    return new Map(nodes.map((node, index) => [node.id, index]));
}

function getNeighborOrderScore(params: {
    fallbackIndex: number;
    neighborOrder: Map<string, number>;
    node: WorkflowVisualiserGraphNode;
    relation: 'upstreamIds' | 'downstreamIds';
}): number {
    const indices = params.node[params.relation]
        .map((nodeId) => params.neighborOrder.get(nodeId))
        .filter((value): value is number => value !== undefined);
    if (indices.length === 0) {
        return Number.MAX_SAFE_INTEGER + params.fallbackIndex;
    }
    return indices.reduce((total, value) => total + value, 0) / indices.length;
}

function sortLevelByNeighbors(params: {
    levelNodes: WorkflowVisualiserGraphNode[];
    neighborOrder: Map<string, number>;
    relation: 'upstreamIds' | 'downstreamIds';
}) {
    return [...params.levelNodes]
        .map((node, index) => ({
            node,
            index,
            score: getNeighborOrderScore({
                node,
                fallbackIndex: index,
                neighborOrder: params.neighborOrder,
                relation: params.relation,
            }),
        }))
        .sort((left, right) => left.score - right.score || left.index - right.index)
        .map((entry) => entry.node);
}

function sortStageLevels(levels: WorkflowVisualiserGraphNode[][]): WorkflowVisualiserGraphNode[][] {
    if (levels.length <= 1) {
        return levels;
    }

    const nextLevels = [...levels];
    for (let levelIndex = nextLevels.length - 2; levelIndex >= 0; levelIndex -= 1) {
        nextLevels[levelIndex] = sortLevelByNeighbors({
            levelNodes: nextLevels[levelIndex],
            neighborOrder: createOrderIndex(nextLevels[levelIndex + 1]),
            relation: 'downstreamIds',
        });
    }

    for (let levelIndex = 1; levelIndex < nextLevels.length; levelIndex += 1) {
        nextLevels[levelIndex] = sortLevelByNeighbors({
            levelNodes: nextLevels[levelIndex],
            neighborOrder: createOrderIndex(nextLevels[levelIndex - 1]),
            relation: 'upstreamIds',
        });
    }

    return nextLevels;
}

function buildStageLevels(nodes: WorkflowVisualiserGraphNode[]): WorkflowVisualiserGraphNode[][] {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const levelsByNodeId = new Map<string, number>();
    const queue = [...nodes];

    while (queue.length > 0) {
        const node = queue.shift();
        if (!node) {
            continue;
        }

        const internalUpstreamIds = node.upstreamIds.filter((upstreamId) => nodesById.has(upstreamId));
        const unresolvedUpstream = internalUpstreamIds.some((upstreamId) => !levelsByNodeId.has(upstreamId));
        if (unresolvedUpstream) {
            queue.push(node);
            continue;
        }

        const nodeLevel = internalUpstreamIds.reduce((highestLevel, upstreamId) => {
            return Math.max(highestLevel, (levelsByNodeId.get(upstreamId) ?? 0) + 1);
        }, 0);

        levelsByNodeId.set(node.id, nodeLevel);
    }

    for (const node of nodes) {
        if (!levelsByNodeId.has(node.id)) {
            levelsByNodeId.set(node.id, 0);
        }
    }

    const levels = new Map<number, WorkflowVisualiserGraphNode[]>();
    for (const node of nodes) {
        const level = levelsByNodeId.get(node.id) ?? 0;
        const levelNodes = levels.get(level) ?? [];
        levelNodes.push(node);
        levels.set(level, levelNodes);
    }

    return sortStageLevels([...levels.entries()]
        .sort((left, right) => left[0] - right[0])
        .map((entry) => entry[1]));
}

function getStageNodeWidth(levels: WorkflowVisualiserGraphNode[][], showRuntimeDetails: boolean): number {
    return Math.max(
        NODE_WIDTH,
        ...levels.flat().map((node) => getNodeWidth(node, showRuntimeDetails)),
    );
}

function getStageWidth(levels: WorkflowVisualiserGraphNode[][], nodeWidth: number): number {
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
        const stageLevels = buildStageLevels(stageNodes);
        const stageNodeWidth = getStageNodeWidth(stageLevels, params.showRuntimeDetails !== false);
        const stageWidth = getStageWidth(stageLevels, stageNodeWidth);
        const previousStage = stageBoxes[stageIndex - 1];
        const stageX = previousStage
            ? previousStage.position.x + previousStage.size.width + STAGE_GAP_X
            : 0;
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
