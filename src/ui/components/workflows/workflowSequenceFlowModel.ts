import { MarkerType, type Edge } from '@xyflow/react';
import type { WorkflowVisualiserGraphEdge } from '@contracts/workflowVisualiser';
import type { WorkflowSequenceMapStageBox } from './workflowSequenceMapModel';

export const SEQUENCE_NODE_LEFT_HANDLE_ID = 'sequence-node-left';
export const SEQUENCE_NODE_RIGHT_HANDLE_ID = 'sequence-node-right';
export const SEQUENCE_NODE_TOP_HANDLE_ID = 'sequence-node-top';
export const SEQUENCE_NODE_BOTTOM_HANDLE_ID = 'sequence-node-bottom';

function getEdgeClearanceY(
    sourceStageId: string,
    stageBoxesById?: Record<string, WorkflowSequenceMapStageBox>
): number {
    const sourceStage = stageBoxesById?.[sourceStageId];
    const sourceBottom = sourceStage ? sourceStage.position.y + sourceStage.size.height : 0;
    return sourceBottom + 32;
}

function getEdgeGapX(
    sourceStageId: string,
    targetStageId: string,
    stageBoxesById?: Record<string, WorkflowSequenceMapStageBox>
): number {
    const sourceStage = stageBoxesById?.[sourceStageId];
    const targetStage = stageBoxesById?.[targetStageId];
    const sourceRight = sourceStage ? sourceStage.position.x + sourceStage.size.width : 0;
    const targetLeft = targetStage ? targetStage.position.x : 0;
    return (sourceRight + targetLeft) / 2;
}

export function buildWorkflowSequenceFlowEdges(
    edges: WorkflowVisualiserGraphEdge[],
    stageIdsByNodeId: Record<string, string>,
    stageBoxesById?: Record<string, WorkflowSequenceMapStageBox>,
): Edge[] {
    return edges.map((edge) => {
        const isFailure = edge.kind === 'failure';
        const sourceStageId = stageIdsByNodeId[edge.source];
        const targetStageId = stageIdsByNodeId[edge.target];
        const isInternal = sourceStageId === targetStageId;
        const color = isFailure ? '#ef4444' : '#4b5563';
        const strokeWidth = 4;
        
        return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: 'workflowEdge',
            sourceHandle: isFailure ? SEQUENCE_NODE_RIGHT_HANDLE_ID : SEQUENCE_NODE_BOTTOM_HANDLE_ID,
            targetHandle: isInternal ? SEQUENCE_NODE_TOP_HANDLE_ID : SEQUENCE_NODE_LEFT_HANDLE_ID,
            animated: false,
            selectable: false,
            markerEnd: { 
                type: MarkerType.ArrowClosed, 
                width: 18, 
                height: 18, 
                color 
            },
            style: {
                stroke: color,
                strokeWidth,
            },
            data: isInternal || !sourceStageId || !targetStageId ? undefined : {
                clearanceY: getEdgeClearanceY(sourceStageId, stageBoxesById),
                gapX: getEdgeGapX(sourceStageId, targetStageId, stageBoxesById),
            },
        };
    });
}
