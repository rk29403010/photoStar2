import type { WorkflowDefinition } from '../contracts';

export const libraryAiMetadataWorkflowDefinition: WorkflowDefinition = {
    id: 'library_ai_metadata_v1',
    version: 1,
    inputs: ['asset'],
    parameters: [
        { id: 'aiMode', valueType: 'enum', required: true, options: ['mock', 'live', 'off'] },
        { id: 'metadataPass', valueType: 'enum', required: false, options: ['scout', 'refine'] },
    ],
    presentation: {
        defaultRunLabel: 'AI metadata workflow',
        stage: 'ai_metadata',
        milestones: [{ id: 'ai_metadata_complete', label: 'AI metadata complete' }],
    },
    nodes: [
        {
            id: 'generate-ai-metadata',
            kind: 'module',
            moduleId: 'runtime.generate_ai_metadata_scout',
            completesMilestones: ['ai_metadata_complete'],
            presentation: {
                label: 'Generate AI metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'metadata result', plural: 'metadata results' },
            },
        },
    ],
};
