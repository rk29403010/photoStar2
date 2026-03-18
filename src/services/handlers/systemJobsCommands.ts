import type { CommandHandlerMap } from './types';
import { getRecentEventsSnapshot } from './systemEventLogCommands';
import { getDataStats } from './systemJobsDataStats';
import { getJobErrorsSnapshot } from './systemDashboardModules';
import { getWorkflowRunsSnapshot } from './systemWorkflowRunSnapshot';
import { getWorkflowStatusSnapshot } from './systemWorkflowStatus';

export const systemJobsCommandHandlers: CommandHandlerMap = {
    get_system_jobs: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const db = dbManager.getDb();
            respond(id, 'ok', {
                jobs: [],
                dataStats: getDataStats(db),
                recentEvents: getRecentEventsSnapshot(db),
                workflowRuns: getWorkflowRunsSnapshot(db),
                workflowStatus: getWorkflowStatusSnapshot(db),
            }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_job_errors: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as { moduleId?: string; page?: number; pageSize?: number };
            ctx.respond(
                ctx.id,
                'ok',
                getJobErrorsSnapshot(ctx.dbManager.getDb(), {
                    moduleId: payload.moduleId,
                    page: payload.page,
                    pageSize: payload.pageSize,
                }),
                null,
                ctx.originWs
            );
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },
};
