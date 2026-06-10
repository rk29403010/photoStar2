import type { WorkflowDefinition } from '../contracts';

export const detectFramesWorkflowDefinition: WorkflowDefinition = {
    id: 'library_detect_frames_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Detect frames workflow',
        milestones: [{ id: 'detect_frames_complete', label: 'Frame detection complete' }],
    },
    nodes: [
        {
            id: 'detect-frames',
            kind: 'module',
            moduleId: 'runtime.detect_frame',
            completesMilestones: ['detect_frames_complete'],
            presentation: {
                label: 'Detect frames',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
    ],
};
