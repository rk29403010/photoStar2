import type { WorkflowDefinition } from '../contracts';

export const libraryFaceWorkflowDefinition: WorkflowDefinition = {
    id: 'library_face_pipeline_v1',
    version: 1,
    inputs: ['asset'],
    presentation: {
        defaultRunLabel: 'Face workflow',
        milestones: [{ id: 'face_pipeline_complete', label: 'Face workflow complete' }],
    },
    nodes: [
        {
            id: 'detect-faces',
            kind: 'module',
            moduleId: 'runtime.detect_faces',
            step: 'face_pipeline',
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
            step: 'face_pipeline',
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
            step: 'face_pipeline',
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
            step: 'face_pipeline',
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
