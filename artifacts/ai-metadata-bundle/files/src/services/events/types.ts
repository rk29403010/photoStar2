export type FolderScanRequested = {
    type: "FolderScanRequested";
    folderId: string;
    scanSessionId: string;
};

export type MediaDiscovered = {
    type: "MediaDiscovered";
    mediaId: string;
    filePath: string;
    width: number;
    height: number;
    scanSessionId: string;
};

export type PreviewGenerated = {
    type: "PreviewGenerated";
    mediaId: string;
    path: string; // Added
};

export type WorkflowPreviewGenerated = {
    type: "WorkflowPreviewGenerated";
    mediaId: string;
    path: string;
};

export type PreviewFailed = {
    type: "PreviewFailed";
    mediaId: string;
    severity: "warning" | "error";
};

export type FacesDetected = {
    type: "FacesDetected";
    mediaId: string;
    faceCount: number;
    source?: 'legacy_pipeline' | 'workflow_runtime';
};

export type FaceEmbeddingGenerated = {
    type: "FaceEmbeddingGenerated";
    mediaId: string;
    faceId: string;
};

export type FaceMatched = {
    type: "FaceMatched";
    mediaId: string;
    faceId: string;
    personId: string | null;
    confidence: number;
};

export type FaceClusteringUpdated = {
    type: "FaceClusteringUpdated";
    clusterId: string;
};

export type JobStarted = {
    type: "JobStarted";
    jobId: string;
    pipelineStage: string;
    totalItems?: number;
};

export type JobProgress = {
    type: "JobProgress";
    jobId: string;
    processedItems: number;
    totalItems?: number;
    currentItemPath?: string;
    throughputIps?: number;
    errorCount?: number;
};

export type JobCompleted = {
    type: "JobCompleted";
    jobId: string;
    pipelineStage?: string;
};

export type JobFailed = {
    type: "JobFailed";
    jobId: string;
    severity: "warning" | "error" | "fatal";
    reason: string;
    pipelineStage?: string;
};

export type SensitivityScored = {
    type: "SensitivityScored";
    mediaId: string;
    score: number;       // 0–100
    tier: 'safe' | 'review' | 'unsafe';
};

export type AiMetadataV2FreshCompleted = {
    type: "AiMetadataV2FreshCompleted";
    mediaId: string;
    usedModel: string;
    queuedProUpgrade: boolean;
};

export type AiMetadataV2ProCompleted = {
    type: "AiMetadataV2ProCompleted";
    mediaId: string;
    usedModel: string;
};

export type AiMetadataV2UpgradeQueued = {
    type: "AiMetadataV2UpgradeQueued";
    mediaId: string;
    reason: 'rate_limit' | 'daily_quota';
    proModel: string;
};

export type AssetUpdated = {
    type: "AssetUpdated";
    assetId: string;
};

export type AiMetadataConfigurationError = {
    type: "AiMetadataConfigurationError";
    workflowRunId: string;
    nodeId: string;
    message: string;
};

/** Emitted when quota fallback occurs — informs UI of degraded service */
export type QuotaWarning = {
    type: "QuotaWarning";
    model: string;          // The model that was rate-limited
    fallbackModel: string;  // The model that was used instead (or '' if none)
    reason: 'rate_limit' | 'daily_quota';
    assetIds: string[];     // Assets affected by this batch
    pendingProCount: number;// How many remain queued for follow-up work
};

/** Emitted when items are queued awaiting pro-model re-analysis */
export type ProAnalysisPending = {
    type: "ProAnalysisPending";
    assetIds: string[];
    proModel: string;
};

export type SystemPausedStateChanged = {
    type: "SystemPausedStateChanged";
    isPaused: boolean;
};

export type DomainEvent =
    | FolderScanRequested
    | MediaDiscovered
    | PreviewGenerated
    | WorkflowPreviewGenerated
    | PreviewFailed
    | FacesDetected
    | FaceEmbeddingGenerated
    | FaceMatched
    | FaceClusteringUpdated
    | JobStarted
    | JobProgress
    | JobCompleted
    | JobFailed
    | SensitivityScored
    | AiMetadataV2FreshCompleted
    | AiMetadataV2ProCompleted
    | AiMetadataV2UpgradeQueued
    | AssetUpdated
    | AiMetadataConfigurationError
    | QuotaWarning
    | ProAnalysisPending
    | SystemPausedStateChanged;

export type EventType = DomainEvent['type'];
