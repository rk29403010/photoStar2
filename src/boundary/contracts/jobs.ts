export type JobState =
    | "queued" | "starting" | "running" | "paused" | "retrying"
    | "completed" | "failed" | "cancelled" | "idle";

export type StageState =
    | "idle" | "queued" | "running" | "succeeded" | "warning" | "failed" | "skipped";

export type IssueSeverity = "info" | "warning" | "error" | "fatal";

export type JobIssue = {
    id: string;
    severity: IssueSeverity;
    message: string;
    detail?: string;
    mediaIds?: string[];
    stageId?: string;
    createdAt: string;
    action?: { label: string; kind: "open_settings" | "retry" | "show_items" };
}

export type StageProgress = {
    stageId: string;
    label: string;
    state: StageState;
    total?: number;
    done?: number;
    lastHeartbeatAt?: string;
    weight?: number;
}

export type JobProgress = {
    overallTotal?: number;
    overallDone?: number;
    overallPercent?: number;
    indexed?: number;
    analysed?: number;
    facesFound?: number;
    facesRecognised?: number;
    warnings?: number;
    errors?: number;
    stages: StageProgress[];
    message?: string;
    current?: string;
    throughputIps?: number;
    workflowRunId?: string;
}

export type BackgroundJob = {
    id: string;
    stage: string;
    title: string;
    state: JobState;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    trigger: "user" | "system";
    source?: { type: "folder" | "device" | "api"; label: string };
    progress: JobProgress;
    issues: JobIssue[];
    activeCount?: number;
    avgDurationSec?: number;
    canPause?: boolean;
    canCancel?: boolean;
    canRetry?: boolean;
}

export type JobErrorModuleSummary = {
    id: string;
    label: string;
    errorCount: number;
}

export type JobErrorListItem = {
    id: string;
    moduleId: string;
    moduleLabel: string;
    source: "processing_issue" | "failed_job";
    severity: IssueSeverity;
    message: string;
    createdAt: string;
    jobId?: string;
    task?: string;
    stage?: string;
}

export type JobErrorSnapshot = {
    generatedAt: string;
    page: number;
    pageSize: number;
    total: number;
    moduleFilter: string | null;
    availableModules: JobErrorModuleSummary[];
    items: JobErrorListItem[];
}

export type WorkflowStatusListItem = {
    workflowId: string;
    displayName: string;
    stage?: string;
    totalRuns: number;
    running: number;
    completed: number;
    failed: number;
    latestRunId: string | null;
    latestStatus: string | null;
    latestCreatedAt: string | null;
}

export type WorkflowStatusSnapshot = {
    generatedAt: string;
    totals: {
        running: number;
        completed: number;
        failed: number;
        totalRuns: number;
    };
    workflows: WorkflowStatusListItem[];
}

export type DataStatsSnapshot = {
    generatedAt: string;
    totals: {
        assets: number;
        people: number;
        photosWithAiMetadata: number;
        photosWithDetectedFaces: number;
        photosWithMatchedFaces: number;
    };
    coverage: {
        aiMetadataPercent: number;
        faceMatchedPercent: number;
    };
    faces: {
        detected: number;
        matched: number;
        unmatched: number;
    };
}

export type RecentEventSnapshot = {
    id: string;
    type: string;
    createdAt: string;
    payload: unknown;
}

export type WorkflowRunMilestoneSnapshot = {
    milestoneId: string;
    label: string;
    status: string;
}

export type WorkflowRunListItem = {
    runId: string;
    workflowId: string;
    displayName: string;
    status: string;
    createdAt: string;
    parameters: Record<string, unknown>;
    totalItems: number;
    completedItems: number;
    failedItems: number;
    milestones: WorkflowRunMilestoneSnapshot[];
    stepSummaries: Array<{
        nodeId: string;
        status: string;
        totalItems: number;
        completedItems: number;
        failedItems: number;
    }>;
}
