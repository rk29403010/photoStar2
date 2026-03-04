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
    message?: string; // Compatibility with existing backend
    current?: string; // Compatibility with existing backend
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
