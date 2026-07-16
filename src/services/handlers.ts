import { executeCommandRoute } from './handlers/router';
import type { CommandContext } from './handlers/types';
import { assetCommandHandlers } from './handlers/assetCommands';
import { collectionCommandHandlers } from './handlers/collectionCommands';
import { groupDiagnosticsCommandHandlers } from './handlers/groupDiagnosticsCommands';
import { peopleCommandHandlers } from './handlers/peopleCommands';
import { systemCommandHandlers } from './handlers/systemCommands';
import { systemEventLogCommandHandlers } from './handlers/systemEventLogCommands';
import { systemJobsCommandHandlers } from './handlers/systemJobsCommands';
import { systemWorkflowRuntimeCommandHandlers } from './handlers/systemWorkflowRuntimeCommands';
import { tagCommandHandlers } from './handlers/tagCommands';
import { photoEditCommandHandlers } from './handlers/photoEditCommands';

const COMMAND_ROUTES = [
    systemCommandHandlers,
    systemWorkflowRuntimeCommandHandlers,
    systemEventLogCommandHandlers,
    peopleCommandHandlers,
    collectionCommandHandlers,
    groupDiagnosticsCommandHandlers,
    photoEditCommandHandlers,
    assetCommandHandlers,
    tagCommandHandlers,
    systemJobsCommandHandlers,
];

export type { CommandContext } from './handlers/types';

export async function handleSystemCommand(ctx: CommandContext): Promise<boolean> {
    const handled = await executeCommandRoute(ctx, COMMAND_ROUTES);
    if (!handled) {
        throw new Error(`Unknown command: ${ctx.command}`);
    }
    return true;
}
