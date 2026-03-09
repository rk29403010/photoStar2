import type { CommandContext, CommandHandlerMap } from './types';

export function executeCommandRoute(ctx: CommandContext, routes: CommandHandlerMap[]): boolean {
    for (const route of routes) {
        const handler = route[ctx.command];
        if (!handler) {continue;}
        void handler(ctx);
        return true;
    }
    return false;
}
