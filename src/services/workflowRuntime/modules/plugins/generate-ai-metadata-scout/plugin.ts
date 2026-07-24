import { createGenerateAiMetadataScoutModule } from '../../generateAiMetadata';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const generateAiMetadataScoutPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.generate_ai_metadata_scout', contractVersion: 1, displayName: 'Generate AI metadata scout', description: 'Generates an initial AI metadata pass.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }], capabilities: ['external_api'] },
    create: (context) => createGenerateAiMetadataScoutModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
