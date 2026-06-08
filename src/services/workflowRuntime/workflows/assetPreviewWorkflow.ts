import type { WorkflowDefinition } from '../contracts';

export const assetPreviewWorkflowDefinition: WorkflowDefinition = {
    id: 'asset-preview',
    version: 1,
    inputs: ['asset'],
    nodes: [
        {
            id: 'generate-preview',
            kind: 'module',
            moduleId: 'legacy.preview.generate',
        },
    ],
};
