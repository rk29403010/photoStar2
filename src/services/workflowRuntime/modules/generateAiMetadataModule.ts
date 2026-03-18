import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../data/db';
import type { AssetUpdated } from '../../events/types';
import type { ModuleDefinition } from '../contracts';

function buildMetadataPayload(assetId: string, mode: 'mock' | 'live'): Record<string, unknown> {
    return {
        mode,
        caption: mode === 'mock' ? `Mock caption for ${assetId}` : `Live-ready caption for ${assetId}`,
        tags: mode === 'mock' ? ['mock-tag'] : ['live-tag'],
        notes: mode === 'mock' ? 'Deterministic mock response' : 'Deterministic live placeholder response',
    };
}

export interface GenerateAiMetadataModuleOptions {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: AssetUpdated) => void;
    };
}

export function createGenerateAiMetadataModule(options: GenerateAiMetadataModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.generate_ai_metadata',
        version: 1,
        capability: 'external_api',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }],
        run: async (context) => {
            const aiMode = context.parameters.aiMode === 'mock' || context.parameters.aiMode === 'live'
                ? context.parameters.aiMode
                : 'off';

            if (aiMode === 'off') {
                return { outputs: [] };
            }

            const db = options.dbManager.getDb();
            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
                .run(context.subject.subjectId, 'ai_metadata');
            db.prepare(`
                INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
                VALUES (?, ?, 'ai_metadata', 'runtime_stub', '1.0', ?)
            `).run(
                uuidv4(),
                context.subject.subjectId,
                JSON.stringify(buildMetadataPayload(context.subject.subjectId, aiMode)),
            );
            options.eventBus?.emit({
                type: 'AssetUpdated',
                assetId: context.subject.subjectId,
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }] };
        },
    };
}
