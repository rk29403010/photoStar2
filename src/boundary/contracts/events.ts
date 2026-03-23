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

export type QuotaWarning = {
    type: "QuotaWarning";
    model: string;
    fallbackModel: string;
    reason: 'rate_limit' | 'daily_quota';
    assetIds: string[];
    pendingProCount: number;
};

export type ProAnalysisPending = {
    type: "ProAnalysisPending";
    assetIds: string[];
    proModel: string;
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
    asset: Record<string, unknown>; // Full asset object pushed from backend
};

export type AiMetadataConfigurationError = {
    type: "AiMetadataConfigurationError";
    workflowRunId: string;
    nodeId: string;
    message: string;
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
    | AssetUpdated
    | AiMetadataConfigurationError
    | QuotaWarning
    | ProAnalysisPending
    | AiMetadataV2FreshCompleted
    | AiMetadataV2ProCompleted
    | AiMetadataV2UpgradeQueued;
