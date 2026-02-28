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
    | JobStarted
    | JobProgress
    | JobCompleted
    | JobFailed;
