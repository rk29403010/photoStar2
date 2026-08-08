import type { WorkflowRunListItem } from './jobs';

export type WorkflowVisualiserFailedSubject = {
    subjectType: string;
    subjectId: string;
    label: string;
    originalPath?: string;
}

export type WorkflowVisualiserStatus = 'idle' | 'running' | 'completed' | 'failed';

export type WorkflowVisualiserCountNoun = {
    singular: string;
    plural: string;
}

export type WorkflowVisualiserCounts = {
    totalItems: number;
    completedItems: number;
    failedItems: number;
}

export type WorkflowVisualiserAggregateCount = {
    noun: WorkflowVisualiserCountNoun;
} & WorkflowVisualiserCounts

export type WorkflowVisualiserRunSummary = {
    runId: string;
    workflowId: string;
    status: string;
    createdAt?: string;
    parameters: Record<string, unknown>;
    linkedRuns?: WorkflowVisualiserLinkedRun[];
} & WorkflowVisualiserCounts

export type WorkflowVisualiserLinkedRun = {
    runId: string;
    workflowId: string;
    displayName: string;
    status: string;
    createdAt?: string;
    relationship: 'recovery' | 'source';
} & WorkflowVisualiserCounts

export type WorkflowVisualiserMilestone = {
    milestoneId: string;
    label: string;
    status: string;
}

export type WorkflowVisualiserOverviewModel = {
    summary: {
        title: string;
        description: string;
    };
    milestones: WorkflowVisualiserMilestone[];
    aggregateCounts: WorkflowVisualiserAggregateCount[];
}

export type WorkflowVisualiserProgressionStage = {
    id: string;
    label: string;
    description: string;
    status: WorkflowVisualiserStatus;
    nodeIds: string[];
    countNoun: WorkflowVisualiserCountNoun;
    aggregateCounts: WorkflowVisualiserAggregateCount[];
} & WorkflowVisualiserCounts

export type WorkflowVisualiserGraphNode = {
    id: string;
    label: string;
    kind: 'module' | 'control';
    status: WorkflowVisualiserStatus;
    upstreamIds: string[];
    downstreamIds: string[];
    moduleId?: string;
    controlType?: string;
    countNoun: WorkflowVisualiserCountNoun;
    estimatedCostPerCall?: number;
    totalEstimatedCost?: number;
} & WorkflowVisualiserCounts

export type WorkflowVisualiserGraphEdge = {
    id: string;
    source: string;
    target: string;
    kind?: 'default' | 'failure';
}

export type WorkflowVisualiserTextSection = {
    id: string;
    label: string;
    items: Array<{
        id: string;
        label: string;
        value?: string;
    }>;
}

export type WorkflowVisualiserDetail = {
    id: string;
    label: string;
    description: string;
    kind: 'module' | 'control' | 'stage';
    status: WorkflowVisualiserStatus;
    errorMessage?: string;
    upstreamIds: string[];
    downstreamIds: string[];
    counts: WorkflowVisualiserCounts;
    countNoun: WorkflowVisualiserCountNoun;
    aggregateCounts: WorkflowVisualiserAggregateCount[];
    failedSubjects: WorkflowVisualiserFailedSubject[];
    moduleId?: string;
    controlType?: string;
    settings?: WorkflowVisualiserSetting[];
}

export type WorkflowVisualiserSetting = {
    id: string;
    value: unknown;
}

export type WorkflowVisualiserWorkflowSummary = {
    workflowId: string;
    displayName: string;
}

export type WorkflowModuleRepositoryOutput = {
    kind: 'artifact';
    artifactType: string;
    subjectType: string;
}

export type WorkflowModuleRepositoryModule = {
    id: string;
    contractVersion: number;
    displayName: string;
    description: string;
    inputs: string[];
    outputs: WorkflowModuleRepositoryOutput[];
    capabilities: string[];
    milestones: Array<{ id: string; label: string }>;
    errorKinds: string[];
    fixtures: string[];
    workflows: WorkflowVisualiserWorkflowSummary[];
}

export type WorkflowModuleRepositoryModel = {
    modules: WorkflowModuleRepositoryModule[];
}

export type WorkflowVisualiserModel = {
    workflowId: string;
    displayName: string;
    availableWorkflows: WorkflowVisualiserWorkflowSummary[];
    selectedRun: WorkflowVisualiserRunSummary | null;
    availableRuns: WorkflowRunListItem[];
    tabs: {
        overview: WorkflowVisualiserOverviewModel;
        progression: {
            stages: WorkflowVisualiserProgressionStage[];
        };
        graph: {
            nodes: WorkflowVisualiserGraphNode[];
            edges: WorkflowVisualiserGraphEdge[];
        };
        text: {
            sections: WorkflowVisualiserTextSection[];
        };
    };
    details: WorkflowVisualiserDetail[];
}
