import type { WorkflowDefinition } from '../contracts';

export const simulationWorkflowDefinition: WorkflowDefinition = {
    id: 'runtime.simulation_workflow',
    version: 1,
    inputs: ['folder'],
    presentation: {
        defaultRunLabel: 'Simulation Workflow',
        milestones: [
            { id: 'enumeration', label: 'Simulating Discovery' },
            { id: 'fast_processing', label: 'Fast Processing' },
            { id: 'medium_processing', label: 'Medium Processing' },
            { id: 'slow_processing', label: 'Slow Processing' },
        ],
    },
    nodes: [
        {
            id: 'enumerate-sim',
            kind: 'module',
            moduleId: 'runtime.simulator',
            runMode: 'once_per_batch',
            completesMilestones: ['enumeration'],
            outputsTo: ['fast-task-sim'],
            presentation: {
                label: 'Mock Discovery',
                countNoun: { singular: 'item', plural: 'items' },
            },
        },
        {
            id: 'fast-task-sim',
            kind: 'module',
            moduleId: 'runtime.simulator',
            runMode: 'per_subject',
            completesMilestones: ['fast_processing'],
            outputsTo: ['medium-task-sim'],
            presentation: {
                label: 'Fast Step',
                artifactNoun: { singular: 'result', plural: 'results' },
            },
        },
        {
            id: 'medium-task-sim',
            kind: 'module',
            moduleId: 'runtime.simulator',
            runMode: 'per_subject',
            completesMilestones: ['medium_processing'],
            outputsTo: ['slow-task-sim'],
            presentation: {
                label: 'Medium Step (5% error)',
                artifactNoun: { singular: 'result', plural: 'results' },
            },
        },
        {
            id: 'slow-task-sim',
            kind: 'module',
            moduleId: 'runtime.simulator',
            runMode: 'per_subject',
            completesMilestones: ['slow_processing'],
            presentation: {
                label: 'Slow AI Step',
                artifactNoun: { singular: 'metadata', plural: 'metadata' },
            },
        },
    ],
    parameters: [
        { id: 'mode', valueType: 'string', required: true },
        { id: 'iterations', valueType: 'string', required: false }, // Using string for simple parameter parsing in UI if needed
        { id: 'speed', valueType: 'string', required: false },
        { id: 'errorType', valueType: 'string', required: false },
        { id: 'errorRate', valueType: 'string', required: false },
        { id: 'mockPayloadTemplate', valueType: 'string', required: false },
        { id: 'resourceLoadMode', valueType: 'string', required: false },
    ],
};
