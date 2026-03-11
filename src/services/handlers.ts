import { executeCommandRoute } from './handlers/router';
import type { CommandContext } from './handlers/types';
import { assetCommandHandlers } from './handlers/assetCommands';
import { collectionCommandHandlers } from './handlers/collectionCommands';
import { peopleCommandHandlers } from './handlers/peopleCommands';
import { systemCommandHandlers } from './handlers/systemCommands';
import { systemEventLogCommandHandlers } from './handlers/systemEventLogCommands';
import { systemJobsCommandHandlers } from './handlers/systemJobsCommands';

const COMMAND_ROUTES = [
    systemCommandHandlers,
    systemEventLogCommandHandlers,
    peopleCommandHandlers,
    collectionCommandHandlers,
    assetCommandHandlers,
    systemJobsCommandHandlers,
];

export type { CommandContext } from './handlers/types';

export function handleSystemCommand(ctx: CommandContext): boolean {
    const handled = executeCommandRoute(ctx, COMMAND_ROUTES);
    if (!handled) {
        throw new Error(`Unknown command: ${ctx.command}`);
    }
    return true;
}
