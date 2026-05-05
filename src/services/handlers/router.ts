import type { CommandContext, CommandHandlerMap } from './types';

export async function executeCommandRoute(ctx: CommandContext, routes: CommandHandlerMap[]): Promise<boolean> {
    for (const route of routes) {
        const handler = route[ctx.command];
        if (!handler) {continue;}
        await handler(ctx);
        return true;
    }
    return false;
}
