import { createEstimatePhotoDateModule } from '../../estimatePhotoDateModule';
import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const estimatePhotoDatePlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.estimate_photo_date', contractVersion: 1, displayName: 'Estimate photo date', description: 'Estimates the date a photo was taken.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'photo_date_estimate', subjectType: 'asset' }], capabilities: ['derive'] },
    create: (context) => createEstimatePhotoDateModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined }),
};
