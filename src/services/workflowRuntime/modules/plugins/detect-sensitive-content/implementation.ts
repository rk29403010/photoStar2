import sharp from 'sharp';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { ModuleDefinition } from '../../../contracts';
import { getFrameInteriorBox } from '../../../../photoMetadata/frameUtils';

export type DetectSensitiveContentModuleOptions = {
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
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?')
                .get(context.subject.subjectId) as { original_path: string } | undefined;

            if (asset?.original_path) {
                const frameDetectionRow = db.prepare('SELECT data FROM derived_results WHERE asset_id = ? AND task = ?')
                    .get(context.subject.subjectId, 'frame_detection') as { data: string } | undefined;

                let interiorBox: { x: number; y: number; width: number; height: number } | null = null;
                if (frameDetectionRow) {
                    try {
                        const boundaryData = JSON.parse(frameDetectionRow.data);
                        interiorBox = getFrameInteriorBox(boundaryData);
                    } catch (error) {
                        console.error('Error parsing frame detection data:', error);
                    }
                }

                let pipeline = sharp(asset.original_path).rotate();
                if (interiorBox) {
                    const metadata = await sharp(asset.original_path).rotate().metadata();
                    if (metadata.width && metadata.height) {
                        const left = Math.max(0, Math.min(Math.round(interiorBox.x * metadata.width), metadata.width - 1));
                        const top = Math.max(0, Math.min(Math.round(interiorBox.y * metadata.height), metadata.height - 1));
                        const cropWidth = Math.max(1, Math.min(Math.round(interiorBox.width * metadata.width), metadata.width - left));
                        const cropHeight = Math.max(1, Math.min(Math.round(interiorBox.height * metadata.height), metadata.height - top));
                        pipeline = pipeline.extract({ left, top, width: cropWidth, height: cropHeight });
                    }
                }
                await pipeline.toBuffer();
            }

            db.prepare('UPDATE assets SET sensitivity_score = ? WHERE id = ?')
                .run(5, context.subject.subjectId);
            options.eventBus?.emit({
                type: 'AssetUpdated',
                assetId: context.subject.subjectId,
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'sensitivity_score', subjectType: 'asset' }] };
        },
    };
}
