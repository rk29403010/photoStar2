import type { DatabaseManager } from '../../../data/db';
import type { AssetUpdated } from '../../events/types';
import { getFileStats } from '../../file-utils';
import { persistAssetEmbeddedMetadata } from '../../embeddedMetadata';
import type { ModuleDefinition } from '../contracts';

export interface ExtractEmbeddedMetadataModuleOptions {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: AssetUpdated) => void;
    };
}

type AssetRow = {
    id: string;
    original_path: string;
    file_size: number | null;
};

function loadAsset(db: ReturnType<DatabaseManager['getDb']>, assetId: string): AssetRow | undefined {
    return db.prepare(`
        SELECT id, original_path, file_size
        FROM assets
        WHERE id = ?
        LIMIT 1
    `).get(assetId) as AssetRow | undefined;
}

export function createExtractEmbeddedMetadataModule(options: ExtractEmbeddedMetadataModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.extract_embedded_metadata',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'embedded_metadata', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = loadAsset(db, context.subject.subjectId);
            if (!asset) {
                return { outputs: [] };
            }

            const stats = getFileStats(asset.original_path);
            const snapshot = await persistAssetEmbeddedMetadata({
                db,
                assetId: asset.id,
                originalPath: asset.original_path,
                fileSize: asset.file_size ?? stats.size,
                birthtime: stats.birthtime,
            });

            if (!snapshot) {
                return { outputs: [] };
            }

            options.eventBus?.emit({
                type: 'AssetUpdated',
                assetId: asset.id,
            });

            return {
                outputs: [{ kind: 'artifact', artifactType: 'embedded_metadata', subjectType: 'asset' }],
            };
        },
    };
}
