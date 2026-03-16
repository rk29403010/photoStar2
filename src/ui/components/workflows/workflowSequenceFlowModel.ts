import { MarkerType, type Edge } from '@xyflow/react';
import type { WorkflowVisualiserGraphEdge } from '@contracts/workflowVisualiser';

export const SEQUENCE_NODE_LEFT_HANDLE_ID = 'sequence-node-left';
export const SEQUENCE_NODE_RIGHT_HANDLE_ID = 'sequence-node-right';
export const SEQUENCE_NODE_TOP_HANDLE_ID = 'sequence-node-top';
export const SEQUENCE_NODE_BOTTOM_HANDLE_ID = 'sequence-node-bottom';

export function buildWorkflowSequenceFlowEdges(
    edges: WorkflowVisualiserGraphEdge[],
    stageIdsByNodeId: Record<string, string>,
): Edge[] {
    return edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: stageIdsByNodeId[edge.source] === stageIdsByNodeId[edge.target]
            ? SEQUENCE_NODE_BOTTOM_HANDLE_ID
            : SEQUENCE_NODE_RIGHT_HANDLE_ID,
        targetHandle: stageIdsByNodeId[edge.source] === stageIdsByNodeId[edge.target]
            ? SEQUENCE_NODE_TOP_HANDLE_ID
            : SEQUENCE_NODE_LEFT_HANDLE_ID,
        animated: false,
        selectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#67e8f9' },
        style: {
            stroke: '#67e8f9',
            strokeWidth: 2,
        },
    }));
}
