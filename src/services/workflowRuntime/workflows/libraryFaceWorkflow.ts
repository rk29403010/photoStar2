import type { WorkflowDefinition } from '../contracts';

export const libraryFaceWorkflowDefinition: WorkflowDefinition = {
    id: 'library_face_pipeline_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Face workflow',
        stage: 'face_analysis',
        milestones: [{ id: 'face_pipeline_complete', label: 'Face workflow complete' }],
        stages: [
            {
                id: 'detection',
                label: 'Detection',
                description: 'Detect faces in assets.',
                nodeIds: ['detect-faces', 'generate-face-vectors'],
            },
            {
                id: 'resolution',
                label: 'Resolution',
                description: 'Group and resolve people candidate identities.',
                nodeIds: ['collect-people', 'resolve-people'],
            },
        ],
    },
    nodes: [
        {
            id: 'detect-faces',
            kind: 'module',
            moduleId: 'runtime.detect_faces',
            outputsTo: ['generate-face-vectors'],
            presentation: {
                label: 'Detect faces',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'face', plural: 'faces' },
            },
        },
        {
            id: 'generate-face-vectors',
            kind: 'module',
            moduleId: 'runtime.generate_face_vectors',
            outputsTo: ['collect-people'],
            presentation: {
                label: 'Generate face vectors',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'collect-people',
            kind: 'control',
            controlType: 'collect',
            outputsTo: ['resolve-people'],
            presentation: {
                label: 'Collect people candidates',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'resolve-people',
            kind: 'module',
            moduleId: 'runtime.resolve_people',
            runMode: 'once_per_batch',
            completesMilestones: ['face_pipeline_complete'],
            presentation: {
                label: 'Resolve people',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'person', plural: 'people' },
            },
        },
    ],
};
