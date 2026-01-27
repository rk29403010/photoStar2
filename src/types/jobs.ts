export type JobState =
    | "queued" | "starting" | "running" | "paused" | "retrying"
    | "completed" | "failed" | "cancelled";

export type StageState =
    | "idle" | "queued" | "running" | "succeeded" | "warning" | "failed" | "skipped";

export type IssueSeverity = "info" | "warning" | "error" | "fatal";

export type JobKind =
    | "bulk_ingest"
    | "watched_folder_ingest"
    | "reindex"
    | "face_analysis"
    | "similarity_cluster";

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
}

export interface BackgroundJob {
    id: string;
    kind: JobKind;
    title: string;
    state: JobState;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    trigger: "user" | "system";
    source?: { type: "folder" | "device" | "api"; label: string };
    progress: JobProgress;
    issues: JobIssue[];
    canPause?: boolean;
    canCancel?: boolean;
    canRetry?: boolean;
}
