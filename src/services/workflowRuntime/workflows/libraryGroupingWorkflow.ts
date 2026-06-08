import type { WorkflowDefinition } from '../contracts';

export const libraryGroupingWorkflowDefinition: WorkflowDefinition = {
    id: 'library_grouping_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Library grouping',
        milestones: [
            { id: 'grouping_complete', label: 'Grouping complete' },
        ],
    },
    nodes: [
        {
            id: 'group-library-assets',
            kind: 'module',
            moduleId: 'runtime.group_similar_photos',
            runMode: 'once_per_batch',
            completesMilestones: ['grouping_complete'],
            presentation: {
                label: 'Group similar photos',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'group', plural: 'groups' },
            },
        },
    ],
};
