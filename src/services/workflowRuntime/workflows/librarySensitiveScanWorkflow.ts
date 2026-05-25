import type { WorkflowDefinition } from '../contracts';

export const librarySensitiveScanWorkflowDefinition: WorkflowDefinition = {
    id: 'library_sensitive_scan_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Sensitive content workflow',
        milestones: [{ id: 'sensitive_scan_complete', label: 'Sensitive scan complete' }],
    },
    nodes: [
        {
            id: 'detect-sensitive-content',
            kind: 'module',
            moduleId: 'runtime.detect_sensitive_content',
            step: 'sensitive_scan',
            completesMilestones: ['sensitive_scan_complete'],
            presentation: {
                label: 'Detect sensitive content',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
    ],
};
