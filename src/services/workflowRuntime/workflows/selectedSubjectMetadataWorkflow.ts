import type { WorkflowDefinition } from '../contracts';

export const selectedSubjectMetadataWorkflowDefinition: WorkflowDefinition = {
    id: 'selected_subject_metadata_v1',
    version: 1,
    inputs: ['selection'],
    parameters: [
        { id: 'aiMode', valueType: 'enum', required: true, options: ['mock', 'live', 'off'] },
        { id: 'imageStrategy', valueType: 'enum', required: false, options: ['overview_only', 'overview_plus_tiles'] },
        { id: 'metadataPass', valueType: 'enum', required: false, options: ['scout', 'refine'] },
    ],
    presentation: {
        defaultRunLabel: 'Selected subject metadata workflow',
        milestones: [{ id: 'ai_metadata_complete', label: 'AI metadata complete' }],
    },
    nodes: [
        {
            id: 'expand-selection',
            kind: 'module',
            moduleId: 'runtime.expand_selection',
            step: 'ai_metadata',
            outputsTo: ['generate-ai-metadata'],
            presentation: {
                label: 'Expand selection',
                countNoun: { singular: 'selection', plural: 'selections' },
                artifactNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'generate-ai-metadata',
            kind: 'module',
            moduleId: 'runtime.generate_ai_metadata_scout',
            step: 'ai_metadata',
            outputsTo: ['estimate-photo-date-from-ai'],
            presentation: {
                label: 'Generate AI metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'metadata result', plural: 'metadata results' },
            },
        },
        {
            id: 'estimate-photo-date-from-ai',
            kind: 'module',
            moduleId: 'runtime.estimate_photo_date',
            step: 'ai_metadata',
            completesMilestones: ['ai_metadata_complete'],
            presentation: {
                label: 'Estimate photo date from AI metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'date estimate', plural: 'date estimates' },
            },
        },
    ],
};
