import { z } from 'zod';
import type { Asset, Person, TimelineGalleryPage, TimelineGroupSummary, TimelineJumpTarget } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import type {
    BackgroundJob,
    DataStatsSnapshot,
    RecentEventSnapshot,
    WorkflowRunListItem,
    WorkflowStatusSnapshot,
} from '@contracts/jobs';
import type { DomainEvent } from '@contracts/events';
import type { FolderHistoryItem } from '@contracts/usePhotoLibrary.types';
import { isTimelineGroupId } from '@shared/utils/libraryTimelineGroupId';

const AssetSchema = z.object({
    id: z.string(),
    original_path: z.string(),
}).passthrough();

const PersonSchema = z.object({
    id: z.string(),
    name: z.string(),
    face_count: z.number(),
}).passthrough();

const StageSchema = z.object({
    stageId: z.string(),
    label: z.string(),
    state: z.enum(['idle', 'queued', 'running', 'succeeded', 'warning', 'failed', 'skipped']),
    total: z.number().optional(),
    done: z.number().optional(),
    lastHeartbeatAt: z.string().optional(),
    weight: z.number().optional(),
}).passthrough();

const JobIssueSchema = z.object({
    id: z.string(),
    severity: z.enum(['info', 'warning', 'error', 'fatal']),
    message: z.string(),
    createdAt: z.string(),
}).passthrough();

const BackgroundJobSchema = z.object({
    id: z.string(),
    stage: z.string(),
    title: z.string(),
    state: z.enum(['queued', 'starting', 'running', 'paused', 'retrying', 'completed', 'failed', 'cancelled', 'idle']),
    createdAt: z.string(),
    trigger: z.enum(['user', 'system']),
    progress: z.object({ stages: z.array(StageSchema) }).passthrough(),
    issues: z.array(JobIssueSchema),
}).passthrough();

const WorkflowStatusSchema = z.object({
    generatedAt: z.string(),
    totals: z.object({
        running: z.number(),
        completed: z.number(),
        failed: z.number(),
        totalRuns: z.number(),
    }),
    workflows: z.array(z.object({
        workflowId: z.string(),
        displayName: z.string(),
        totalRuns: z.number(),
        running: z.number(),
        completed: z.number(),
        failed: z.number(),
        latestRunId: z.string().nullable(),
        latestStatus: z.string().nullable(),
        latestCreatedAt: z.string().nullable(),
        stage: z.string().optional(),
    })),
});

const DataStatsSchema = z.object({
    generatedAt: z.string(),
    totals: z.object({
        assets: z.number(),
        people: z.number(),
        photosWithAiMetadata: z.number(),
        photosWithDetectedFaces: z.number(),
        photosWithMatchedFaces: z.number(),
    }),
    coverage: z.object({
        aiMetadataPercent: z.number(),
        faceMatchedPercent: z.number(),
    }),
    faces: z.object({
        detected: z.number(),
        matched: z.number(),
        unmatched: z.number(),
    }),
});

const RecentEventSchema = z.object({
    id: z.string(),
    type: z.string(),
    createdAt: z.string(),
    payload: z.unknown(),
});

const WorkflowRunSchema = z.object({
    runId: z.string(),
    workflowId: z.string(),
    displayName: z.string(),
    status: z.string(),
    createdAt: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    totalItems: z.number(),
    completedItems: z.number(),
    failedItems: z.number(),
    milestones: z.array(z.object({
        milestoneId: z.string(),
        label: z.string(),
        status: z.string(),
    })),
    stepSummaries: z.array(z.object({
        nodeId: z.string(),
        status: z.string(),
        totalItems: z.number(),
        completedItems: z.number(),
        failedItems: z.number(),
    })),
});

const FolderHistorySchema = z.object({
    path: z.string(),
    last_scanned_at: z.string(),
});

const PresentationItemSchema = z.object({
    presentationKey: z.string(),
    representativeAssetId: z.string(),
    relationshipKind: z.enum(['edit_lineage', 'exact_copy', 'near_duplicate', 'variant', 'capture_sequence']).nullable(),
    stackCount: z.number(),
    assetIds: z.array(z.string()),
    momentCount: z.number(),
});

const TimelineGroupIdSchema = z.custom<ReturnType<typeof timelineGroupIdType>>(
    (value) => isTimelineGroupId(value),
);

function timelineGroupIdType() {
    return 'unknown-date' as const;
}

const TimelineGroupSummarySchema = z.object({
    id: TimelineGroupIdSchema,
    label: z.string(),
    sortKey: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    itemCount: z.number(),
    isLoaded: z.boolean(),
});

const TimelineGroupItemSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('row'),
        rowId: z.string(),
        assets: z.array(AssetSchema),
    }),
    z.object({
        kind: z.literal('asset'),
        asset: AssetSchema,
        assetId: z.string(),
    }),
]);

const TimelineGalleryPageSchema = z.object({
    groupId: TimelineGroupIdSchema,
    items: z.array(TimelineGroupItemSchema),
    nextCursor: z.string().nullable(),
    isFullyLoaded: z.boolean(),
});

const TimelineJumpTargetSchema = z.object({
    groupId: TimelineGroupIdSchema,
    anchorAssetId: z.string().optional(),
});

const DomainEventSchema: z.ZodType<DomainEvent> = z.discriminatedUnion('type', [
    z.object({ type: z.literal('FolderScanRequested'), folderId: z.string(), scanSessionId: z.string() }),
    z.object({ type: z.literal('MediaDiscovered'), mediaId: z.string(), filePath: z.string(), width: z.number(), height: z.number(), scanSessionId: z.string() }),
    z.object({ type: z.literal('PreviewGenerated'), mediaId: z.string(), path: z.string() }),
    z.object({ type: z.literal('WorkflowPreviewGenerated'), mediaId: z.string(), path: z.string() }),
    z.object({ type: z.literal('PreviewFailed'), mediaId: z.string(), severity: z.enum(['warning', 'error']) }),
    z.object({ type: z.literal('FacesDetected'), mediaId: z.string(), faceCount: z.number(), source: z.enum(['legacy_pipeline', 'workflow_runtime']).optional() }),
    z.object({ type: z.literal('FaceEmbeddingGenerated'), mediaId: z.string(), faceId: z.string() }),
    z.object({ type: z.literal('FaceMatched'), mediaId: z.string(), faceId: z.string(), personId: z.string().nullable(), confidence: z.number() }),
    z.object({ type: z.literal('FaceClusteringUpdated'), clusterId: z.string() }),
    z.object({ type: z.literal('JobStarted'), jobId: z.string(), pipelineStage: z.string(), totalItems: z.number().optional() }),
    z.object({ type: z.literal('JobProgress'), jobId: z.string(), processedItems: z.number(), totalItems: z.number().optional(), currentItemPath: z.string().optional(), throughputIps: z.number().optional(), errorCount: z.number().optional() }),
    z.object({ type: z.literal('JobCompleted'), jobId: z.string(), pipelineStage: z.string().optional() }),
    z.object({ type: z.literal('JobFailed'), jobId: z.string(), severity: z.enum(['warning', 'error', 'fatal']), reason: z.string(), pipelineStage: z.string().optional() }),
    z.object({ type: z.literal('QuotaWarning'), model: z.string(), fallbackModel: z.string(), reason: z.enum(['rate_limit', 'daily_quota']), assetIds: z.array(z.string()), pendingProCount: z.number() }),
    z.object({ type: z.literal('ProAnalysisPending'), assetIds: z.array(z.string()), proModel: z.string() }),
    z.object({ type: z.literal('AiMetadataV2FreshCompleted'), mediaId: z.string(), usedModel: z.string(), queuedProUpgrade: z.boolean() }),
    z.object({ type: z.literal('AiMetadataV2ProCompleted'), mediaId: z.string(), usedModel: z.string() }),
    z.object({ type: z.literal('AiMetadataV2UpgradeQueued'), mediaId: z.string(), reason: z.enum(['rate_limit', 'daily_quota']), proModel: z.string() }),
    z.object({ type: z.literal('AssetUpdated'), assetId: z.string(), asset: z.record(z.string(), z.unknown()).optional() }),
    z.object({ type: z.literal('AiMetadataConfigurationError'), workflowRunId: z.string(), nodeId: z.string(), message: z.string() }),
    z.object({ type: z.literal('WorkflowStepStarted'), runId: z.string(), nodeId: z.string(), expectedItems: z.number().optional() }),
    z.object({ type: z.literal('WorkflowStepCompleted'), runId: z.string(), nodeId: z.string() }),
    z.object({ type: z.literal('WorkflowStepFailed'), runId: z.string(), nodeId: z.string(), error: z.string().optional() }),
    z.object({ type: z.literal('WorkflowSubjectStarted'), runId: z.string(), nodeId: z.string(), subjectType: z.string(), subjectId: z.string() }),
    z.object({ type: z.literal('WorkflowSubjectCompleted'), runId: z.string(), nodeId: z.string(), subjectType: z.string(), subjectId: z.string() }),
    z.object({ type: z.literal('WorkflowSubjectFailed'), runId: z.string(), nodeId: z.string(), subjectType: z.string(), subjectId: z.string(), error: z.string().optional() }),
]);

export type LegacyProgressPayload = {
    processed?: number;
    total?: number;
    message?: string;
    current?: string;
    status?: string;
};

function parseValue<T>(schema: z.ZodType<T>, value: unknown): T | null {
    const result = schema.safeParse(value);
    return result.success ? result.data : null;
}

function parseArray<T>(schema: z.ZodType<T>, value: unknown): T[] | null {
    const result = z.array(schema).safeParse(value);
    return result.success ? result.data : null;
}

export function readRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : null;
}

export function readAssets(value: unknown): Asset[] | null {
    return parseArray(AssetSchema, value);
}

export function readPeople(value: unknown): Person[] | null {
    return parseArray(PersonSchema, value);
}

export function readBackgroundJobs(value: unknown): BackgroundJob[] | null {
    return parseArray(BackgroundJobSchema, value);
}

export function readWorkflowStatus(value: unknown): WorkflowStatusSnapshot | null {
    return parseValue(WorkflowStatusSchema, value);
}

export function readDataStats(value: unknown): DataStatsSnapshot | null {
    return parseValue(DataStatsSchema, value);
}

export function readRecentEvents(value: unknown): RecentEventSnapshot[] | null {
    return parseArray(RecentEventSchema, value);
}

export function readWorkflowRuns(value: unknown): WorkflowRunListItem[] | null {
    return parseArray(WorkflowRunSchema, value);
}

export function readFolderHistory(value: unknown): FolderHistoryItem[] | null {
    return parseArray(FolderHistorySchema, value);
}

export function readPresentationItems(value: unknown): LibraryPresentationItem[] | null {
    return parseArray(PresentationItemSchema, value);
}

export function readTimelineGroupSummaries(value: unknown): TimelineGroupSummary[] | null {
    return parseArray(TimelineGroupSummarySchema, value);
}

export function readTimelineGalleryPage(value: unknown): TimelineGalleryPage | null {
    return parseValue(TimelineGalleryPageSchema, value);
}

export function readTimelineJumpTarget(value: unknown): TimelineJumpTarget | null {
    return parseValue(TimelineJumpTargetSchema, value);
}

export function readDomainEvent(value: unknown): DomainEvent | null {
    return parseValue(DomainEventSchema, value);
}

export function readLegacyProgress(value: unknown): LegacyProgressPayload {
    const record = readRecord(value);
    if (!record) {return {};}
    return {
        processed: typeof record.processed === 'number' ? record.processed : undefined,
        total: typeof record.total === 'number' ? record.total : undefined,
        message: typeof record.message === 'string' ? record.message : undefined,
        current: typeof record.current === 'string' ? record.current : undefined,
        status: typeof record.status === 'string' ? record.status : undefined,
    };
}
