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
    | "ai_metadata"
    | "ai_metadata_3f"
    | "ai_metadata_31p";

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

export interface QueueStageStatus {
    stage: string;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
    oldestPendingAt: string | null;
    oldestProcessingAt: string | null;
    processingMediaIds: string[];
    runningJobs: number;
}

export interface QueueStatusSnapshot {
    generatedAt: string;
    totals: {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        total: number;
    };
    stages: QueueStageStatus[];
}

export interface DataStatsSnapshot {
    generatedAt: string;
    totals: {
        assets: number;
        people: number;
        photosWithAiMetadata: number;
        photosWithDetectedFaces: number;
        photosWithMatchedFaces: number;
        pendingProAnalysis: number;
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
    aiMetadataQueues: {
        freshPending: number;
        freshProcessing: number;
        freshFailed: number;
        proPending: number;
        proProcessing: number;
        proFailed: number;
        proCompleted: number;
    };
    lastAiMetadataQuotaBlock: {
        createdAt: string;
        model: string;
        reason: 'rate_limit' | 'daily_quota';
        fallbackModel: string;
        affectedCount: number;
    } | null;
}

export interface RecentEventSnapshot {
    id: string;
    type: string;
    createdAt: string;
    payload: unknown;
}
