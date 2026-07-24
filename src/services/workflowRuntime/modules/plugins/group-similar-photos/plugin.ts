import { createGroupSimilarPhotosModule } from '../../groupSimilarPhotosModule';
import type { DatabaseManager } from '../../../../../data/db';
import type { WorkflowModulePlugin } from '../../../contracts';

export const groupSimilarPhotosPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.group_similar_photos', contractVersion: 1, displayName: 'Group similar photos', description: 'Groups visually similar photos.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }], capabilities: ['group'] },
    create: (context) => createGroupSimilarPhotosModule({ dbManager: context.dbManager as DatabaseManager }),
};
