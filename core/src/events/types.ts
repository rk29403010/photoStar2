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

export type PreviewRequested = {
    type: "PreviewRequested";
    mediaIds: string[];
    reason: "ingest" | "repair" | "rebuild";
};

export type PreviewGenerated = {
    type: "PreviewGenerated";
    mediaId: string;
    path: string; // Added
};

export type PreviewFailed = {
    type: "PreviewFailed";
    mediaId: string;
    severity: "warning" | "error";
};

export type FaceDetectionRequested = {
    type: "FaceDetectionRequested";
    mediaId?: string;
    mediaIds?: string[];
};

export type FacesDetected = {
    type: "FacesDetected";
    mediaId: string;
    faceCount: number;
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

export type FaceRecognitionRequested = {
    type: "FaceRecognitionRequested";
    mediaIds?: string[];
};

export type FaceClusteringRequested = {
    type: "FaceClusteringRequested";
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

export type AiMetadataRequested = {
    type: "AiMetadataRequested";
    mediaIds?: string[];
    jobId?: string;
    queueMode?: 'fresh' | 'pro_pending' | 'all';
};

export type SensitiveScanRequested = {
    type: "SensitiveScanRequested";
    mediaIds?: string[];
};

export type AssetUpdated = {
    type: "AssetUpdated";
    assetId: string;
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

export type ComputeHashesRequested = {
    type: "ComputeHashesRequested";
};

export type DuplicateGroupingRequested = {
    type: "DuplicateGroupingRequested";
};

export type VariantGroupingRequested = {
    type: "VariantGroupingRequested";
};

export type BurstGroupingRequested = {
    type: "BurstGroupingRequested";
    jobId?: string;
};

export type DomainEvent =
    | FolderScanRequested
    | MediaDiscovered
    | PreviewRequested
    | PreviewGenerated
    | PreviewFailed
    | FaceDetectionRequested
    | FacesDetected
    | FaceEmbeddingGenerated
    | FaceMatched
    | FaceClusteringUpdated
    | FaceRecognitionRequested
    | FaceClusteringRequested
    | JobStarted
    | JobProgress
    | JobCompleted
    | JobFailed
    | SensitivityScored
    | AiMetadataRequested
    | SensitiveScanRequested
    | AssetUpdated
    | QuotaWarning
    | ProAnalysisPending
    | SystemPausedStateChanged
    | ComputeHashesRequested
    | DuplicateGroupingRequested
    | VariantGroupingRequested
    | BurstGroupingRequested;

export type EventType = DomainEvent['type'];
