import {
    createContributor,
    ensureCurrentContributor,
    listContributors,
    selectContributor,
} from '../relationships/contributorRepository';
import type { CommandHandlerMap } from './types';

export const contributorCommandHandlers: CommandHandlerMap = {
    get_contributors: (ctx) => {
        const { id, originWs, respond } = ctx;
        try {
            const db = ctx.dbManager.getDb();
            const current = ensureCurrentContributor(db);
            respond(id, 'ok', {
                contributors: listContributors(db),
                currentContributorId: current.id,
            }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    create_contributor: (ctx) => {
        const { id, payload, originWs, respond } = ctx;
        try {
            const { displayName, select = true } = payload as { displayName: string; select?: boolean };
            const db = ctx.dbManager.getDb();
            const contributor = createContributor(db, displayName);
            if (select) {
                selectContributor(db, contributor.id);
            }
            respond(id, 'ok', { contributor }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    select_contributor: (ctx) => {
        const { id, payload, originWs, respond } = ctx;
        try {
            const { contributorId } = payload as { contributorId: string };
            const contributor = selectContributor(ctx.dbManager.getDb(), contributorId);
            respond(id, 'ok', { contributor }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
