import { createDetectSensitiveContentModule } from './implementation';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const detectSensitiveContentPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.detect_sensitive_content', contractVersion: 1, displayName: 'Detect sensitive content', description: 'Detects sensitive content in assets.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'sensitivity_score', subjectType: 'asset' }], capabilities: ['analyze'] },
    create: (context) => createDetectSensitiveContentModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
