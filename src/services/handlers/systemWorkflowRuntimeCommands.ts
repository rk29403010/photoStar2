import type { CommandHandlerMap, CommandContext } from './types';
import { getWorkflowVisualiserModel } from './systemWorkflowVisualiser';
import { buildPhotoMetadataBundle } from '../photoMetadata/bundle';
import { createPhotoMetadataManualAssertionsService } from '../photoMetadata/manualAssertions';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';

function getWorkflowRuntime(ctx: CommandContext) {
    if (!ctx.workflowRuntime) {
        throw new Error('Workflow runtime is not configured');
    }
    return ctx.workflowRuntime;
}

type AssetSubject = {
    subjectType: 'asset';
    subjectId: string;
};
type SelectionSubject = {
    subjectType: string;
    subjectId: string;
};

function loadAssetSubjects(ctx: CommandContext, mediaId?: string): AssetSubject[] {
    const rows = mediaId
        ? ctx.dbManager.getDb().prepare(`
            SELECT id
            FROM assets
            WHERE id = ?
            ORDER BY created_at ASC, id ASC
        `).all(mediaId)
        : ctx.dbManager.getDb().prepare(`
            SELECT id
            FROM assets
            ORDER BY created_at ASC, id ASC
        `).all();

    return (rows as Array<{ id: string }>).map((row) => ({
        subjectType: 'asset',
        subjectId: row.id,
    }));
}

function startAssetWorkflow(
    ctx: CommandContext,
    payload: { mediaId?: string } | undefined,
    params: {
        workflowId: string;
        parameters?: Record<string, unknown>;
    },
) {
    const workflowRuntime = getWorkflowRuntime(ctx);
    const inputSubjects = loadAssetSubjects(ctx, payload?.mediaId);
    const runId = workflowRuntime.orchestrator.startDetached({
        workflowId: params.workflowId,
        triggerType: 'manual',
        inputSubjects,
        parameters: params.parameters,
    });

    ctx.respond(ctx.id, 'ok', {
        runId,
        workflowId: params.workflowId,
        assetCount: inputSubjects.length,
    }, null, ctx.originWs);
}

function normalizeSelectedSubjects(payload: {
    mediaId?: string;
    selectedSubjects?: SelectionSubject[];
} | undefined): SelectionSubject[] {
    if (Array.isArray(payload?.selectedSubjects) && payload.selectedSubjects.length > 0) {
        return payload.selectedSubjects;
    }
    if (payload?.mediaId) {
        return [{ subjectType: 'asset', subjectId: payload.mediaId }];
    }
    return [];
}

export const systemWorkflowRuntimeCommandHandlers: CommandHandlerMap = {
    get_photo_metadata: (ctx) => {
        const payload = ctx.payload as { assetId?: string; includeEvidence?: boolean } | undefined;
        if (!payload?.assetId) {
            throw new Error('assetId is required');
        }

        const repository = createPhotoMetadataRepository({ dbManager: ctx.dbManager });
        const manualAssertionsService = createPhotoMetadataManualAssertionsService({ dbManager: ctx.dbManager });
        const photoMetadata = buildPhotoMetadataBundle({
            repository,
            manualAssertionsService,
            assetId: payload.assetId,
            includeEvidence: payload.includeEvidence === true,
        });

        ctx.respond(ctx.id, 'ok', { photo_metadata: photoMetadata }, null, ctx.originWs);
    },
    start_workflow_run: async (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const payload = ctx.payload as {
            workflowId: string;
            triggerType: string;
            inputSubjects: Array<{ subjectType: string; subjectId: string }>;
        };
        const runId = workflowRuntime.orchestrator.startDetached(payload);
        ctx.respond(ctx.id, 'ok', { runId }, null, ctx.originWs);
    },
    start_folder_ingest: async (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const payload = ctx.payload as {
            folderPath: string;
            traversalMode?: 'folder_only' | 'recursive';
            aiMode?: 'mock' | 'live' | 'off';
        };
        const runId = workflowRuntime.orchestrator.startDetached({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: payload.folderPath }],
            parameters: {
                folderPath: payload.folderPath,
                traversalMode: payload.traversalMode ?? 'folder_only',
                aiMode: payload.aiMode ?? 'live',
            },
        });
        ctx.respond(ctx.id, 'ok', { runId }, null, ctx.originWs);
    },
    start_library_grouping: async (ctx) => {
        startAssetWorkflow(ctx, undefined, {
            workflowId: 'library_grouping_v1',
        });
    },
    start_library_preview_workflow: async (ctx) => {
        startAssetWorkflow(ctx, undefined, {
            workflowId: 'library_previews_v1',
        });
    },
    start_library_face_workflow: async (ctx) => {
        startAssetWorkflow(ctx, undefined, {
            workflowId: 'library_face_pipeline_v1',
        });
    },
    start_library_sensitive_scan_workflow: async (ctx) => {
        startAssetWorkflow(ctx, undefined, {
            workflowId: 'library_sensitive_scan_v1',
        });
    },
    start_library_ai_metadata_workflow: async (ctx) => {
        const payload = ctx.payload as {
            aiMode?: 'mock' | 'live' | 'off';
            mediaId?: string;
        } | undefined;
        startAssetWorkflow(ctx, payload, {
            workflowId: 'library_ai_metadata_v1',
            parameters: {
                aiMode: payload?.aiMode ?? 'live',
            },
        });
    },
    start_selected_subject_metadata_workflow: async (ctx) => {
        const payload = ctx.payload as {
            aiMode?: 'mock' | 'live' | 'off';
            imageStrategy?: 'overview_only' | 'overview_plus_tiles';
            mediaId?: string;
            selectedSubjects?: SelectionSubject[];
        } | undefined;
        const selectedSubjects = normalizeSelectedSubjects(payload);
        if (selectedSubjects.length === 0) {
            throw new Error('Selected subject metadata workflow requires at least one selected subject');
        }
        const workflowRuntime = getWorkflowRuntime(ctx);
        const runId = workflowRuntime.orchestrator.startDetached({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: `selection:${Date.now()}` }],
            parameters: {
                aiMode: payload?.aiMode ?? 'live',
                imageStrategy: payload?.imageStrategy ?? 'overview_only',
                selectedSubjects,
            },
        });
        ctx.respond(ctx.id, 'ok', {
            runId,
            workflowId: 'selected_subject_metadata_v1',
            assetCount: selectedSubjects.length,
        }, null, ctx.originWs);
    },
    get_workflow_run_detail: (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const payload = ctx.payload as { runId: string };
        const detail = workflowRuntime.store.getRunDetail(payload.runId);
        ctx.respond(ctx.id, 'ok', detail, null, ctx.originWs);
    },
    get_workflow_visualiser: (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const payload = ctx.payload as { workflowId: string; runId?: string | null } | undefined;
        const workflowDefinition = workflowRuntime.workflows.get(String(payload?.workflowId ?? ''));
        const model = getWorkflowVisualiserModel({
            db: ctx.dbManager.getDb(),
            workflowDefinition,
            getRunDetail: (runId) => workflowRuntime.store.getRunDetail(runId),
            requestedRunId: payload?.runId,
        });
        ctx.respond(ctx.id, 'ok', model, null, ctx.originWs);
    },
};
