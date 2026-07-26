import { createGenerateAiMetadataPluginModule } from '../../generateAiMetadata';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const generateAiMetadataRefinePlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.generate_ai_metadata_refine', contractVersion: 1, displayName: 'Generate AI metadata refine', description: 'Refines AI metadata for an asset.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }], capabilities: ['external_api'] },
    create: (context) => createGenerateAiMetadataPluginModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }, { id: 'runtime.generate_ai_metadata_refine', estimatedCostPerCall: 0.0022, imageStrategy: 'overview_plus_tiles', metadataPass: 'refine' }),
};

export function createGenerateAiMetadataRefinePluginModule(options: Parameters<typeof createGenerateAiMetadataPluginModule>[0]) {
    return createGenerateAiMetadataPluginModule(options, { id: 'runtime.generate_ai_metadata_refine', estimatedCostPerCall: 0.0022, imageStrategy: 'overview_plus_tiles', metadataPass: 'refine' });
}
