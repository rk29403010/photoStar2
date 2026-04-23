import type { WorkflowRunListItem } from './jobs';

export interface WorkflowVisualiserFailedSubject {
    subjectType: string;
    subjectId: string;
    label: string;
    originalPath?: string;
}

export type WorkflowVisualiserStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkflowVisualiserCountNoun {
    singular: string;
    plural: string;
}

export interface WorkflowVisualiserCounts {
    totalItems: number;
    completedItems: number;
    failedItems: number;
}

export interface WorkflowVisualiserAggregateCount extends WorkflowVisualiserCounts {
    noun: WorkflowVisualiserCountNoun;
}

export interface WorkflowVisualiserRunSummary extends WorkflowVisualiserCounts {
    runId: string;
    workflowId: string;
    status: string;
    createdAt?: string;
    parameters: Record<string, unknown>;
    linkedRuns?: WorkflowVisualiserLinkedRun[];
}

export interface WorkflowVisualiserLinkedRun extends WorkflowVisualiserCounts {
    runId: string;
    workflowId: string;
    displayName: string;
    status: string;
    createdAt?: string;
    relationship: 'recovery' | 'source';
}

export interface WorkflowVisualiserMilestone {
    milestoneId: string;
    label: string;
    status: string;
}

export interface WorkflowVisualiserOverviewModel {
    summary: {
        title: string;
        description: string;
    };
    milestones: WorkflowVisualiserMilestone[];
    aggregateCounts: WorkflowVisualiserAggregateCount[];
}

export interface WorkflowVisualiserProgressionStage extends WorkflowVisualiserCounts {
    id: string;
    label: string;
    description: string;
    status: WorkflowVisualiserStatus;
    nodeIds: string[];
    countNoun: WorkflowVisualiserCountNoun;
    aggregateCounts: WorkflowVisualiserAggregateCount[];
}

export interface WorkflowVisualiserGraphNode extends WorkflowVisualiserCounts {
    id: string;
    label: string;
    kind: 'module' | 'control';
    status: WorkflowVisualiserStatus;
    upstreamIds: string[];
    downstreamIds: string[];
    moduleId?: string;
    controlType?: string;
    countNoun: WorkflowVisualiserCountNoun;
}

export interface WorkflowVisualiserGraphEdge {
    id: string;
    source: string;
    target: string;
}

export interface WorkflowVisualiserTextSection {
    id: string;
    label: string;
    items: Array<{
        id: string;
        label: string;
        value?: string;
    }>;
}

export interface WorkflowVisualiserDetail {
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
}

export interface WorkflowVisualiserWorkflowSummary {
    workflowId: string;
    displayName: string;
}

export interface WorkflowVisualiserModel {
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
