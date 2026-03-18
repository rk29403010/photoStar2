import type { CommandHandlerMap, CommandContext } from './types';
import { getWorkflowVisualiserModel } from './systemWorkflowVisualiser';

function getWorkflowRuntime(ctx: CommandContext) {
    if (!ctx.workflowRuntime) {
        throw new Error('Workflow runtime is not configured');
    }
    return ctx.workflowRuntime;
}

export const systemWorkflowRuntimeCommandHandlers: CommandHandlerMap = {
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
                aiMode: payload.aiMode ?? 'mock',
            },
        });
        ctx.respond(ctx.id, 'ok', { runId }, null, ctx.originWs);
    },
    start_library_grouping: async (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const assetRows = ctx.dbManager.getDb().prepare(`
            SELECT id
            FROM assets
            ORDER BY created_at ASC, id ASC
        `).all() as Array<{ id: string }>;
        const inputSubjects = assetRows.map((row) => ({
            subjectType: 'asset',
            subjectId: row.id,
        }));
        const runId = workflowRuntime.orchestrator.startDetached({
            workflowId: 'library_grouping_v1',
            triggerType: 'manual',
            inputSubjects,
        });
        ctx.respond(ctx.id, 'ok', { runId, assetCount: inputSubjects.length }, null, ctx.originWs);
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
