export type JobState =
    | "queued" | "starting" | "running" | "paused" | "retrying"
    | "completed" | "failed" | "cancelled" | "idle";

export type StageState =
    | "idle" | "queued" | "running" | "succeeded" | "warning" | "failed" | "skipped";

export type IssueSeverity = "info" | "warning" | "error" | "fatal";

export type PipelineStage =
    | "bulk_ingest"
    | "watched_folder_ingest"
    | "reindex"
    | "scan"
    | "onboarding"
    | "previews"
    | "analysis"
    | "face_analysis"
    | "similarity_cluster"
    | "preview_generation"
    | "sensitive_scan"
    | "ai_metadata";

export interface JobIssue {
    id: string;
    severity: IssueSeverity;
    message: string;
    detail?: string;
    mediaIds?: string[];
    stageId?: string;
    createdAt: string;
    action?: { label: string; kind: "open_settings" | "retry" | "show_items" };
}

export interface StageProgress {
    stageId: string;
    label: string;
    state: StageState;
    total?: number;
    done?: number;
    lastHeartbeatAt?: string;
    weight?: number;
}

export interface JobProgress {
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
}

export interface BackgroundJob {
    id: string;
    stage: PipelineStage;
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

export interface JobErrorModuleSummary {
    id: string;
    label: string;
    errorCount: number;
}

export interface JobErrorListItem {
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

export interface JobErrorSnapshot {
    generatedAt: string;
    page: number;
    pageSize: number;
    total: number;
    moduleFilter: string | null;
    availableModules: JobErrorModuleSummary[];
    items: JobErrorListItem[];
}

export interface WorkflowStatusListItem {
    workflowId: string;
    displayName: string;
    totalRuns: number;
    running: number;
    completed: number;
    failed: number;
    latestRunId: string | null;
    latestStatus: string | null;
    latestCreatedAt: string | null;
}

export interface WorkflowStatusSnapshot {
    generatedAt: string;
    totals: {
        running: number;
        completed: number;
        failed: number;
        totalRuns: number;
    };
    workflows: WorkflowStatusListItem[];
}

export interface DataStatsSnapshot {
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

export interface RecentEventSnapshot {
    id: string;
    type: string;
    createdAt: string;
    payload: unknown;
}

export interface WorkflowRunMilestoneSnapshot {
    milestoneId: string;
    label: string;
    status: string;
}

export interface WorkflowRunListItem {
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
