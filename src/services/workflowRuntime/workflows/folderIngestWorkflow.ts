import type { WorkflowDefinition } from '../contracts';

export const folderIngestWorkflowDefinition: WorkflowDefinition = {
    id: 'folder_ingest_v1',
    version: 1,
    inputs: ['folder'],
    parameters: [
        { id: 'folderPath', valueType: 'string', required: true },
        { id: 'traversalMode', valueType: 'enum', required: true, options: ['folder_only', 'recursive'] },
        { id: 'aiMode', valueType: 'enum', required: true, options: ['mock', 'live', 'off'] },
    ],
    presentation: {
        defaultRunLabel: 'Folder ingest',
        milestones: [
            { id: 'library_ready', label: 'Library ready' },
            { id: 'enrichment_complete', label: 'Enrichment complete' },
        ],
    },
    nodes: [
        {
            id: 'scan-folder',
            kind: 'module',
            moduleId: 'runtime.scan_folder',
            outputsTo: ['preview-each'],
        },
        {
            id: 'preview-each',
            kind: 'control',
            controlType: 'for_each',
            outputsTo: ['generate-previews'],
        },
        {
            id: 'generate-previews',
            kind: 'module',
            moduleId: 'runtime.generate_previews',
            outputsTo: ['detect-faces'],
            completesMilestones: ['library_ready'],
        },
        {
            id: 'detect-faces',
            kind: 'module',
            moduleId: 'runtime.detect_faces',
            outputsTo: ['generate-face-vectors'],
        },
        {
            id: 'generate-face-vectors',
            kind: 'module',
            moduleId: 'runtime.generate_face_vectors',
            outputsTo: ['collect-people', 'collect-similar', 'detect-sensitive-content'],
        },
        {
            id: 'collect-people',
            kind: 'control',
            controlType: 'collect',
            outputsTo: ['resolve-people'],
        },
        {
            id: 'resolve-people',
            kind: 'module',
            moduleId: 'runtime.resolve_people',
            runMode: 'once_per_batch',
        },
        {
            id: 'collect-similar',
            kind: 'control',
            controlType: 'collect',
            outputsTo: ['group-similar-photos'],
        },
        {
            id: 'group-similar-photos',
            kind: 'module',
            moduleId: 'runtime.group_similar_photos',
            runMode: 'once_per_batch',
        },
        {
            id: 'detect-sensitive-content',
            kind: 'module',
            moduleId: 'runtime.detect_sensitive_content',
            outputsTo: ['generate-ai-metadata'],
        },
        {
            id: 'generate-ai-metadata',
            kind: 'module',
            moduleId: 'runtime.generate_ai_metadata',
            completesMilestones: ['enrichment_complete'],
        },
    ],
};
