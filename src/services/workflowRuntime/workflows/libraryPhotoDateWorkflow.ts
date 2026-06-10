import type { WorkflowDefinition } from '../contracts';

export const libraryPhotoDateWorkflowDefinition: WorkflowDefinition = {
    id: 'library_photo_date_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Photo date recalculation workflow',
        stage: 'scan',
        milestones: [{ id: 'photo_date_recalculation_complete', label: 'Photo date recalculation complete' }],
    },
    nodes: [
        {
            id: 'recalculate-photo-date',
            kind: 'module',
            moduleId: 'runtime.estimate_photo_date',
            completesMilestones: ['photo_date_recalculation_complete'],
            presentation: {
                label: 'Recalculate photo date',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'date estimate', plural: 'date estimates' },
            },
        },
    ],
};
