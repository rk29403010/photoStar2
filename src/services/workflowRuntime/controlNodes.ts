import type { SubjectRef } from './executionStore';
import type { WorkflowControlNodeDefinition } from './contracts';

export function executeControlNode(
    node: WorkflowControlNodeDefinition,
    subjects: SubjectRef[],
): SubjectRef[] {
    switch (node.controlType) {
        case 'for_each':
            return [...subjects];
        case 'batch':
            return [...subjects];
        case 'collect':
            return [...subjects];
        case 'approval_gate':
            return [...subjects];
        default:
            throw new Error(`unsupported control type '${String(node.controlType)}'`);
    }
}
