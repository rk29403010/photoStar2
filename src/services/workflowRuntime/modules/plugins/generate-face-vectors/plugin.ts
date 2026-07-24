import { createGenerateFaceVectorsModule } from '../../generateFaceVectorsModule';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const generateFaceVectorsPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.generate_face_vectors', contractVersion: 1, displayName: 'Generate face vectors', description: 'Generates face embeddings for an asset.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }], capabilities: ['derive'] },
    create: (context) => createGenerateFaceVectorsModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
