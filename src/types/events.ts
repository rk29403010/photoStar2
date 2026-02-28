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
    mediaId: string;
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

export type TaskStarted = {
    type: "TaskStarted";
    taskId: string;
    taskKind: string;
};

export type TaskProgress = {
    type: "TaskProgress";
    taskId: string;
    processedItems: number;
    totalItems?: number;
    currentItemPath?: string;
    throughputIps?: number;
    errorCount?: number;
};

export type TaskCompleted = {
    type: "TaskCompleted";
    taskId: string;
    taskKind?: string;
};

export type TaskFailed = {
    type: "TaskFailed";
    taskId: string;
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
    | TaskStarted
    | TaskProgress
    | TaskCompleted
    | TaskFailed;
