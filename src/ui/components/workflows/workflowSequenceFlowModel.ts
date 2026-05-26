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
    return edges.map((edge) => {
        const isFailure = edge.kind === 'failure';
        const isInternal = stageIdsByNodeId[edge.source] === stageIdsByNodeId[edge.target];
        const color = isFailure ? '#ef4444' : '#67e8f9';
        
        return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            sourceHandle: (isFailure || !isInternal) ? SEQUENCE_NODE_RIGHT_HANDLE_ID : SEQUENCE_NODE_BOTTOM_HANDLE_ID,
            targetHandle: isInternal ? SEQUENCE_NODE_TOP_HANDLE_ID : SEQUENCE_NODE_LEFT_HANDLE_ID,
            animated: false,
            selectable: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
            style: {
                stroke: color,
                strokeWidth: 2.5,
            },
        };
    });
}
