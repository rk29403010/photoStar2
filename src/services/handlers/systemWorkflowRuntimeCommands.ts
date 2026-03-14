import type { CommandHandlerMap, CommandContext } from './types';

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
    get_workflow_run_detail: (ctx) => {
        const workflowRuntime = getWorkflowRuntime(ctx);
        const payload = ctx.payload as { runId: string };
        const detail = workflowRuntime.store.getRunDetail(payload.runId);
        ctx.respond(ctx.id, 'ok', detail, null, ctx.originWs);
    },
};
