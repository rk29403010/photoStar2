import type { DatabaseManager } from '../../../data/db';
import type { AssetUpdated } from '../../events/types';
import type { ModuleDefinition } from '../contracts';

export interface DetectSensitiveContentModuleOptions {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: AssetUpdated) => void;
    };
}

export function createDetectSensitiveContentModule(options: DetectSensitiveContentModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.detect_sensitive_content',
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'sensitivity_score', subjectType: 'asset' }],
        run: async (context) => {
            options.dbManager.getDb().prepare('UPDATE assets SET sensitivity_score = ? WHERE id = ?')
                .run(5, context.subject.subjectId);
            options.eventBus?.emit({
                type: 'AssetUpdated',
                assetId: context.subject.subjectId,
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'sensitivity_score', subjectType: 'asset' }] };
        },
    };
}
