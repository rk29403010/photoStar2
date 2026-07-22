import { createDetectFramesModule } from './implementation';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';

export const detectFramesPlugin: WorkflowModulePlugin = {
    manifest: {
        id: 'runtime.detect_frame', contractVersion: 1, displayName: 'Detect photo frame',
        description: 'Detects a photograph boundary and persists its geometry.', inputs: ['asset'],
        outputs: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }],
        capabilities: ['analyze'], errorKinds: ['transient', 'permanent'], fixtures: ['fixtures/framed-photo'],
    },
    create(context) {
        const dbManager = context.dbManager as DatabaseManager | undefined;
        if (!dbManager) {
            throw new Error('runtime.detect_frame requires dbManager');
        }
        return createDetectFramesModule({ dbManager, eventBus: context.eventBus as { emit: (event: AssetUpdated) => void } | undefined });
    },
};
