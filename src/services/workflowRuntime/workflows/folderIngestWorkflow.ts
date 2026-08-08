import type { WorkflowDefinition } from '../contracts';

export const folderIngestWorkflowDefinition: WorkflowDefinition = {
    id: 'folder_ingest_v1',
    version: 1,
    inputs: ['folder'],
    parameters: [
        { id: 'folderPath', valueType: 'string', required: true },
        { id: 'traversalMode', valueType: 'enum', required: true, options: ['folder_only', 'recursive'] },
        { id: 'aiMode', valueType: 'enum', required: true, options: ['mock', 'live', 'off'] },
        { id: 'metadataPass', valueType: 'enum', required: false, options: ['scout', 'refine'] },
    ],
    presentation: {
        defaultRunLabel: 'Folder ingest',
        milestones: [
            { id: 'library_ready', label: 'Library ready' },
            { id: 'enrichment_complete', label: 'Enrichment complete' },
        ],
        stages: [
            {
                id: 'discovery',
                label: 'Discovery',
                description: 'Scan the folder and discover files.',
                nodeIds: ['scan-folder'],
            },
            {
                id: 'library-ready',
                label: 'Ingest',
                description: 'Prepare previews and unlock the browsable library.',
                nodeIds: ['preview-each', 'detect-frame-fast', 'generate-previews', 'collect-previewed-assets'],
            },
            {
                id: 'enrichment',
                label: 'Enrichment',
                description: 'Run downstream analysis, grouping, and metadata branches.',
                nodeIds: [
                    'enrichment-each',
                    'extract-embedded-metadata',
                    'estimate-photo-date-from-embedded',
                    'detect-faces',
                    'generate-face-vectors',
                    'collect-people',
                    'resolve-people',
                    'collect-similar',
                    'group-similar-photos',
                    'detect-sensitive-content',
                    'generate-ai-metadata',
                    'estimate-photo-date-from-ai',
                ],
            },
        ],
    },
    nodes: [
        {
            id: 'scan-folder',
            kind: 'module',
            moduleId: 'runtime.scan_folder',
            outputsTo: ['preview-each'],
            presentation: {
                label: 'Scan folder',
                countNoun: { singular: 'folder', plural: 'folders' },
                artifactNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'preview-each',
            kind: 'control',
            controlType: 'for_each',
            outputsTo: ['detect-frame-fast'],
            presentation: {
                label: 'Preview each',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'detect-frame-fast',
            kind: 'module',
            moduleId: 'runtime.detect_frame',
            parameters: { mode: 'quick' },
            outputsTo: ['generate-previews'],
            presentation: {
                label: 'Quick border scan',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'generate-previews',
            kind: 'module',
            moduleId: 'runtime.generate_previews',
            outputsTo: ['collect-previewed-assets'],
            completesMilestones: ['library_ready'],
            presentation: {
                label: 'Generate previews',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'preview', plural: 'previews' },
            },
        },
        {
            id: 'collect-previewed-assets',
            kind: 'control',
            controlType: 'collect',
            outputsTo: ['enrichment-each'],
            presentation: {
                label: 'Collect previewed images',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'enrichment-each',
            kind: 'control',
            controlType: 'for_each',
            outputsTo: ['extract-embedded-metadata', 'detect-faces', 'collect-similar', 'detect-sensitive-content'],
            presentation: {
                label: 'Enrich each image',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'extract-embedded-metadata',
            kind: 'module',
            moduleId: 'runtime.extract_embedded_metadata',
            outputsTo: ['estimate-photo-date-from-embedded'],
            presentation: {
                label: 'Extract embedded metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'metadata result', plural: 'metadata results' },
            },
        },
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
            presentation: {
                label: 'Resolve people',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'person', plural: 'people' },
            },
        },
        {
            id: 'collect-similar',
            kind: 'control',
            controlType: 'collect',
            outputsTo: ['group-similar-photos'],
            presentation: {
                label: 'Collect similar-photo candidates',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'group-similar-photos',
            kind: 'module',
            moduleId: 'runtime.group_similar_photos',
            runMode: 'once_per_batch',
            presentation: {
                label: 'Group similar photos',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'group', plural: 'groups' },
            },
        },
        {
            id: 'detect-sensitive-content',
            kind: 'module',
            moduleId: 'runtime.detect_sensitive_content',
            outputsTo: ['generate-ai-metadata'],
            presentation: {
                label: 'Detect sensitive content',
                countNoun: { singular: 'image', plural: 'images' },
            },
        },
        {
            id: 'generate-ai-metadata',
            kind: 'module',
            moduleId: 'runtime.generate_ai_metadata_scout',
            outputsTo: ['estimate-photo-date-from-ai'],
            presentation: {
                label: 'Generate AI metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'metadata result', plural: 'metadata results' },
            },
        },
        {
            id: 'estimate-photo-date-from-embedded',
            kind: 'module',
            moduleId: 'runtime.estimate_photo_date',
            presentation: {
                label: 'Estimate photo date from embedded metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'date estimate', plural: 'date estimates' },
            },
        },
        {
            id: 'estimate-photo-date-from-ai',
            kind: 'module',
            moduleId: 'runtime.estimate_photo_date',
            completesMilestones: ['enrichment_complete'],
            presentation: {
                label: 'Estimate photo date from AI metadata',
                countNoun: { singular: 'image', plural: 'images' },
                artifactNoun: { singular: 'date estimate', plural: 'date estimates' },
            },
        },
    ],
};
