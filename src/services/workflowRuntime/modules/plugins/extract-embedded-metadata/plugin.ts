import { createExtractEmbeddedMetadataModule } from '../../extractEmbeddedMetadataModule';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const extractEmbeddedMetadataPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.extract_embedded_metadata', contractVersion: 1, displayName: 'Extract embedded metadata', description: 'Extracts embedded asset metadata.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'embedded_metadata', subjectType: 'asset' }], capabilities: ['derive'] },
    create: (context) => createExtractEmbeddedMetadataModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
