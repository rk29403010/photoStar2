import { createDetectFacesModule } from './implementation';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const detectFacesPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.detect_faces', contractVersion: 1, displayName: 'Detect faces', description: 'Detects faces in an asset.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }], capabilities: ['analyze'] },
    create: (context) => createDetectFacesModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
