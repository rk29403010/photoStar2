import type { CommandHandlerMap, CommandContext } from './types';
import { getWorkflowVisualiserModel } from './systemWorkflowVisualiser';
import { buildPhotoMetadataBundle } from '../photoMetadata/bundle';
import { createPhotoMetadataManualAssertionsService } from '../photoMetadata/manualAssertions';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';
import type { WorkflowDefinition } from '../workflowRuntime/contracts';

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

function parseAiMode(value: unknown): 'mock' | 'live' | 'off' {
    return value === 'mock' || value === 'live' || value === 'off' ? value : 'live';
}

const DEFAULT_WORKFLOW_VISUALISER_ID = 'folder_ingest_v1';

function resolveWorkflowDefinition(workflowDefinitions: WorkflowDefinition[], requestedWorkflowId: string | undefined): WorkflowDefinition {
    const requestedDefinition = workflowDefinitions.find((definition) => definition.id === requestedWorkflowId);
    if (requestedDefinition) {
        return requestedDefinition;
    }

    const fallbackDefinition = workflowDefinitions.find((definition) => definition.id === DEFAULT_WORKFLOW_VISUALISER_ID);
    if (fallbackDefinition) {
        return fallbackDefinition;
    }

    throw new Error(`unknown workflow '${requestedWorkflowId ?? ''}'`);
}

function loadMissingFolderAiMetadataSubjects(ctx: CommandContext, folderPath: string): AssetSubject[] {
    const folderPattern = `${folderPath}${folderPath.endsWith('\\') ? '' : '\\'}%`;
    const rows = ctx.dbManager.getDb().prepare(`
        SELECT a.id
        FROM assets a
        WHERE (a.original_path = ? OR a.original_path LIKE ?)
          AND NOT EXISTS (
              SELECT 1
              FROM photo_metadata_blocks pmb
              WHERE pmb.asset_id = a.id
                AND pmb.source_kind IN ('gemini_flash_scout', 'gemini_pro_refined')
          )
          AND NOT EXISTS (
              SELECT 1
              FROM derived_results dr
              WHERE dr.asset_id = a.id
                AND dr.task = 'ai_metadata'
          )
        ORDER BY a.created_at ASC, a.id ASC
    `).all(folderPath, folderPattern) as Array<{ id: string }>;

    return rows.map((row) => ({
        subjectType: 'asset',
        subjectId: row.id,
    }));
}

function rerunMissingFolderAiMetadata(ctx: CommandContext, runId: string): void {
    const workflowRuntime = getWorkflowRuntime(ctx);
    const runDetail = workflowRuntime.store.getRunDetail(runId);
    const folderPath = typeof runDetail.parameters.folderPath === 'string' ? runDetail.parameters.folderPath : null;
    if (!folderPath) {
        throw new Error('Folder ingest run does not include a folderPath parameter');
    }

    const selectedSubjects = loadMissingFolderAiMetadataSubjects(ctx, folderPath);
    if (selectedSubjects.length === 0) {
        ctx.respond(ctx.id, 'ok', {
            runId: null,
            workflowId: 'selected_subject_metadata_v1',
            assetCount: 0,
            folderPath,
        }, null, ctx.originWs);
        return;
    }

    const nextRunId = workflowRuntime.orchestrator.startDetached({
        workflowId: 'selected_subject_metadata_v1',
        triggerType: 'manual',
        inputSubjects: [{ subjectType: 'selection', subjectId: `selection:${Date.now()}` }],
        parameters: {
            aiMode: parseAiMode(runDetail.parameters.aiMode),
            imageStrategy: 'overview_only',
            metadataPass: 'scout',
            selectedSubjects,
            sourceFolderRunId: runId,
        },
    });

    ctx.respond(ctx.id, 'ok', {
        runId: nextRunId,
        workflowId: 'selected_subject_metadata_v1',
        assetCount: selectedSubjects.length,
        folderPath,
    }, null, ctx.originWs);
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
                metadataPass: 'scout',
            },
        });
        ctx.respond(ctx.id, 'ok', { runId }, null, ctx.originWs);
    },
    estimate_folder_ingest: async (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const payload = ctx.payload as {
            folderPath: string;
            traversalMode?: 'folder_only' | 'recursive';
            aiMode?: 'mock' | 'live' | 'off';
        };
        const estimateResult = await workflowRuntime.orchestrator.estimateWorkflowCost({
            workflowId: 'folder_ingest_v1',
            parameters: {
                folderPath: payload.folderPath,
                traversalMode: payload.traversalMode ?? 'folder_only',
                aiMode: payload.aiMode ?? 'live',
                metadataPass: 'scout',
            },
            inputSubjects: [{ subjectType: 'folder', subjectId: payload.folderPath }],
        });
        ctx.respond(ctx.id, 'ok', estimateResult, null, ctx.originWs);
    },
    start_simulation_workflow: async (ctx) => {
        const payload = (ctx.payload as Record<string, unknown> | undefined) || {};
        const passedParams = (payload.parameters as Record<string, unknown>) || payload;
        
        const parameters = Object.assign({
            iterations: '400',
            speed: 'fast',
            errorType: 'none',
            errorRate: '0',
            resourceLoadMode: 'none',
        }, passedParams) as Record<string, string>;

        const runId = getWorkflowRuntime(ctx).orchestrator.startDetached({
            workflowId: 'runtime.simulation_workflow',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: 'simulation-root' }],
            parameters,
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
        const payload = ctx.payload as {
            mediaId?: string;
        } | undefined;
        startAssetWorkflow(ctx, payload, {
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
                metadataPass: 'scout',
            },
        });
    },
    start_library_photo_date_workflow: async (ctx) => {
        const payload = ctx.payload as {
            mediaId?: string;
        } | undefined;
        startAssetWorkflow(ctx, payload, {
            workflowId: 'library_photo_date_v1',
        });
    },
    start_selected_subject_metadata_workflow: async (ctx) => {
        const payload = ctx.payload as {
            aiMode?: 'mock' | 'live' | 'off';
            imageStrategy?: 'overview_only' | 'overview_plus_tiles';
            metadataPass?: 'scout' | 'refine';
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
                metadataPass: payload?.metadataPass ?? 'scout',
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
        const workflowDefinitions = workflowRuntime.workflows.list();
        const workflowDefinition = resolveWorkflowDefinition(workflowDefinitions, typeof payload?.workflowId === 'string' ? payload.workflowId : undefined);
        const model = getWorkflowVisualiserModel({
            db: ctx.dbManager.getDb(),
            workflowDefinition,
            availableWorkflowDefinitions: workflowDefinitions,
            getRunDetail: (runId) => workflowRuntime.store.getRunDetail(runId),
            requestedRunId: payload?.runId,
            getModuleDefinition: (moduleId) => workflowRuntime.modules.get(moduleId),
        });
        ctx.respond(ctx.id, 'ok', model, null, ctx.originWs);
    },
    rerun_missing_folder_ai_metadata: (ctx) => {
        const payload = ctx.payload as { runId?: string } | undefined;
        if (!payload?.runId) {
            throw new Error('runId is required');
        }
        rerunMissingFolderAiMetadata(ctx, payload.runId);
    },
};
