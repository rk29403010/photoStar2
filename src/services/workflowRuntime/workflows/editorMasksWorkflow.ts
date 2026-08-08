import type { WorkflowDefinition } from '../contracts';

export const editorMasksWorkflowDefinition: WorkflowDefinition = {
    id: 'library_editor_masks_v1', version: 1, inputs: ['asset'],
    parameters: [
        { id: 'frameProvider', valueType: 'enum', required: true, options: ['fastsam', 'efficientsam'] },
        { id: 'objectProvider', valueType: 'enum', required: true, options: ['fastsam', 'efficientsam', 'both'] },
        { id: 'profile', valueType: 'enum', required: true, options: ['quick', 'balanced'] },
    ],
    presentation: { defaultRunLabel: 'Generate editable masks', milestones: [{ id: 'masks_ready', label: 'Masks ready' }] },
    nodes: [
        { id: 'deep-frame', kind: 'module', moduleId: 'runtime.detect_frame', parameters: { mode: 'deep', onlyWhenNeeded: false }, outputsTo: ['segment-objects'], presentation: { label: 'Detect frame' } },
        { id: 'segment-objects', kind: 'module', moduleId: 'runtime.segment_objects', parameters: {}, outputsTo: ['generate-previews'], presentation: { label: 'Find objects' } },
        { id: 'generate-previews', kind: 'module', moduleId: 'runtime.generate_previews', completesMilestones: ['masks_ready'], presentation: { label: 'Refresh previews' } },
    ],
};
