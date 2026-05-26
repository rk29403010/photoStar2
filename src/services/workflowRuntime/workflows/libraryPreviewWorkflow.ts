import type { WorkflowDefinition } from '../contracts';

export const libraryPreviewWorkflowDefinition: WorkflowDefinition = {
    id: 'library_previews_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Library previews',
        milestones: [{ id: 'previews_complete', label: 'Previews complete' }],
    },
    nodes: [
        {
            id: 'generate-previews',
            kind: 'module',
            moduleId: 'runtime.generate_previews',
            step: 'previews',
            completesMilestones: ['previews_complete'],
            presentation: {
                label: 'Generate previews',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'preview', plural: 'previews' },
            },
        },
    ],
};
