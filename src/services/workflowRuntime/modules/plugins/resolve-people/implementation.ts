import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import { rebuildFacePersonCandidates } from '../../../../faces/facePersonCandidateRepository';
import { resolvePeopleAssignments } from '../../../../faces/peopleResolution';
import type { ModuleDefinition } from '../../../contracts';

export type ResolvePeopleModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: DomainEvent) => void;
    };
}

export function createResolvePeopleModule(options: ResolvePeopleModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.resolve_people',
        version: 1,
        capability: 'group',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'person_resolution', subjectType: 'asset' }],
        run: async () => {
            await resolvePeopleAssignments({
                dbManager: options.dbManager,
                eventSink: options.eventBus,
            });
            rebuildFacePersonCandidates(options.dbManager);
            return { outputs: [{ kind: 'artifact', artifactType: 'person_resolution', subjectType: 'asset' }] };
        },
    };
}
