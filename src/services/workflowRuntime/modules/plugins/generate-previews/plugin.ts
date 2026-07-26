import { createGeneratePreviewsModule } from './implementation';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const generatePreviewsPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.generate_previews', contractVersion: 1, displayName: 'Generate previews', description: 'Generates preview artifacts for assets.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'preview', subjectType: 'asset' }], capabilities: ['derive'] },
    create: (context) => createGeneratePreviewsModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
