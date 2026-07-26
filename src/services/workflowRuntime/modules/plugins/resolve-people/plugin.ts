import { createResolvePeopleModule } from './implementation';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const resolvePeoplePlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.resolve_people', contractVersion: 1, displayName: 'Resolve people', description: 'Resolves face vectors to people.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'person_resolution', subjectType: 'asset' }], capabilities: ['group'] },
    create: (context) => createResolvePeopleModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
