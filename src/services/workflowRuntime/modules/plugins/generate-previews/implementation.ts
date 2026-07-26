import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../../../data/db';
import type { WorkflowPreviewGenerated } from '@contracts/events';
import type { ModuleDefinition } from '../../../contracts';
import { getFrameInteriorBox } from '../../../../photoMetadata/frameUtils';

const PREVIEW_SIZES = {
    thumbnail: 256,
    large: 1080,
};

const CURRENT_PREVIEW_VERSION = 4;

function ensurePreviewsDir(db: ReturnType<DatabaseManager['getDb']>): string {
    const previewsDir = join(dirname(db.name), 'previews');
    if (!existsSync(previewsDir)) {
        mkdirSync(previewsDir, { recursive: true });
    }
    return previewsDir;
}

async function writePreviewVariants(
    db: ReturnType<DatabaseManager['getDb']>,
    previewsDir: string,
    asset: { id: string; original_path: string },
    interiorBox: { x: number; y: number; width: number; height: number } | null,
): Promise<string> {
    let thumbnailPath = '';
    for (const [sizeName, width] of Object.entries(PREVIEW_SIZES)) {
        const outputPath = join(previewsDir, `${asset.id}-${sizeName}.webp`);
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
        await pipeline
            .resize(width, null, {
                withoutEnlargement: true,
                fit: 'inside',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ effort: 4, quality: 80 })
            .toFile(outputPath);

        db.prepare(`
            INSERT OR REPLACE INTO previews (asset_id, size, path, version)
            VALUES (?, ?, ?, ?)
        `).run(asset.id, sizeName, outputPath, CURRENT_PREVIEW_VERSION);
        if (sizeName === 'thumbnail') {
            thumbnailPath = outputPath;
        }
    }
    return thumbnailPath;
}

export type GeneratePreviewsModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: WorkflowPreviewGenerated) => void;
    };
}

export function createGeneratePreviewsModule(options: GeneratePreviewsModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.generate_previews',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'preview', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT id, original_path FROM assets WHERE id = ?').get(context.subject.subjectId) as
                | { id: string; original_path: string }
                | undefined;

            if (!asset) {
                throw new Error(`Unknown asset '${context.subject.subjectId}'`);
            }

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

            const thumbnailPath = await writePreviewVariants(db, ensurePreviewsDir(db), asset, interiorBox);
            if (thumbnailPath) {
                options.eventBus?.emit({
                    type: 'WorkflowPreviewGenerated',
                    mediaId: asset.id,
                    path: thumbnailPath,
                });
            }
            return { outputs: [{ kind: 'artifact', artifactType: 'preview', subjectType: 'asset' }] };
        },
    };
}
