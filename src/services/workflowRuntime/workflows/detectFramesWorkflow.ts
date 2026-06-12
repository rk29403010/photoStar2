import type { WorkflowDefinition } from '../contracts';

export const detectFramesWorkflowDefinition: WorkflowDefinition = {
    id: 'library_detect_frames_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Detect frames workflow',
        stage: 'scan',
        milestones: [{ id: 'detect_frames_complete', label: 'Frame detection complete' }],
    },
    nodes: [
        {
            id: 'detect-frames',
            kind: 'module',
            moduleId: 'runtime.detect_frame',
            outputsTo: ['generate-previews'],
            presentation: {
                label: 'Detect frames',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'generate-previews',
            kind: 'module',
            moduleId: 'runtime.generate_previews',
            completesMilestones: ['detect_frames_complete'],
            presentation: {
                label: 'Generate previews',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'preview', plural: 'previews' },
            },
        },
    ],
};
