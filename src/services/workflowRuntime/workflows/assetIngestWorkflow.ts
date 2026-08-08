import type { WorkflowDefinition } from '../contracts';

/** Runs the same post-discovery ingest/enrichment stages as folder_ingest_v1 for one existing asset. */
export const assetIngestWorkflowDefinition: WorkflowDefinition = {
    id: 'asset_ingest_v1',
    version: 1,
    inputs: ['asset'],
    parameters: [
        { id: 'aiMode', valueType: 'enum', required: true, options: ['mock', 'live', 'off'] },
        { id: 'metadataPass', valueType: 'enum', required: false, options: ['scout', 'refine'] },
    ],
    presentation: {
        defaultRunLabel: 'Single-file ingest',
        milestones: [
            { id: 'library_ready', label: 'Library ready' },
            { id: 'enrichment_complete', label: 'Enrichment complete' },
        ],
        stages: [
            {
                id: 'library-ready',
                label: 'Ingest',
                description: 'Refresh the quick frame scan and previews for this image.',
                nodeIds: ['detect-frame-fast', 'generate-previews'],
            },
            {
                id: 'enrichment',
                label: 'Enrichment',
                description: 'Run the same downstream analysis and metadata branches as folder ingest.',
                nodeIds: [
                    'extract-embedded-metadata', 'detect-print-texture', 'estimate-photo-date-from-embedded',
                    'detect-faces',
                    'generate-face-vectors', 'resolve-people', 'group-similar-photos',
                    'detect-sensitive-content', 'generate-ai-metadata', 'estimate-photo-date-from-ai',
                ],
            },
        ],
    },
    nodes: [
        {
            id: 'detect-frame-fast', kind: 'module', moduleId: 'runtime.detect_frame',
            parameters: { mode: 'quick' }, outputsTo: ['generate-previews'],
            presentation: { label: 'Quick border scan', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'generate-previews', kind: 'module', moduleId: 'runtime.generate_previews',
            outputsTo: ['extract-embedded-metadata', 'detect-faces', 'group-similar-photos', 'detect-sensitive-content', 'detect-print-texture'],
            completesMilestones: ['library_ready'],
            presentation: { label: 'Generate previews', countNoun: { singular: 'image', plural: 'images' }, artifactNoun: { singular: 'preview', plural: 'previews' } },
        },
        {
            id: 'detect-print-texture', kind: 'module', moduleId: 'runtime.detect_print_texture',
            presentation: { label: 'Detect print texture', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'extract-embedded-metadata', kind: 'module', moduleId: 'runtime.extract_embedded_metadata',
            outputsTo: ['estimate-photo-date-from-embedded'],
            presentation: { label: 'Extract embedded metadata', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'estimate-photo-date-from-embedded', kind: 'module', moduleId: 'runtime.estimate_photo_date',
            presentation: { label: 'Estimate photo date from embedded metadata', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'detect-faces', kind: 'module', moduleId: 'runtime.detect_faces', outputsTo: ['generate-face-vectors'],
            presentation: { label: 'Detect faces', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'generate-face-vectors', kind: 'module', moduleId: 'runtime.generate_face_vectors', outputsTo: ['resolve-people'],
            presentation: { label: 'Generate face vectors', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'resolve-people', kind: 'module', moduleId: 'runtime.resolve_people', runMode: 'once_per_batch',
            presentation: { label: 'Resolve people', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'group-similar-photos', kind: 'module', moduleId: 'runtime.group_similar_photos', runMode: 'once_per_batch',
            presentation: { label: 'Group similar photos', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'detect-sensitive-content', kind: 'module', moduleId: 'runtime.detect_sensitive_content', outputsTo: ['generate-ai-metadata'],
            presentation: { label: 'Detect sensitive content', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'generate-ai-metadata', kind: 'module', moduleId: 'runtime.generate_ai_metadata_scout', outputsTo: ['estimate-photo-date-from-ai'],
            presentation: { label: 'Generate AI metadata', countNoun: { singular: 'image', plural: 'images' } },
        },
        {
            id: 'estimate-photo-date-from-ai', kind: 'module', moduleId: 'runtime.estimate_photo_date',
            completesMilestones: ['enrichment_complete'],
            presentation: { label: 'Estimate photo date from AI metadata', countNoun: { singular: 'image', plural: 'images' } },
        },
    ],
};
