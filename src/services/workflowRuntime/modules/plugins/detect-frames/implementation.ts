import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { ModuleDefinition } from '../../../contracts';
import { detectSimpleBorder } from '../../../../photoMetadata/borderDetection';
import { initImageSegmentation, segmentPhotoFromFrame } from '../../../../faces/imageSegmentation';

export type DetectFramesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: { emit: (event: AssetUpdated) => void };
};

function isPixelOnBoundary(mask: Uint8Array, x: number, y: number, width: number, height: number): boolean {
    const index = y * width + x;
    return mask[index] === 1 && (x === 0 || x === width - 1 || y === 0 || y === height - 1 || mask[index - 1] === 0 || mask[index + 1] === 0 || mask[index - width] === 0 || mask[index + width] === 0);
}

function findContourPoints(mask: Uint8Array, width: number, height: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (isPixelOnBoundary(mask, x, y, width, height)) {
                points.push({ x: x / width, y: y / height });
            }
        }
    }
    const step = Math.max(1, Math.ceil(points.length / 100));
    return points.filter((_, index) => index % step === 0);
}

async function detectDeepFrame(originalPath: string): Promise<Array<{ x: number; y: number }>> {
    await initImageSegmentation();
    const size = 1024;
    const image = await sharp(originalPath).rotate().resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Float32Array(3 * size * size);
    for (let index = 0; index < size * size; index += 1) {
        pixels[index] = image.data[index * 3] / 255;
        pixels[index + size * size] = image.data[index * 3 + 1] / 255;
        pixels[index + (2 * size * size)] = image.data[index * 3 + 2] / 255;
    }
    return findContourPoints(await segmentPhotoFromFrame(pixels, size, size), size, size);
}

export function createDetectFramesModule(options: DetectFramesModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.detect_frame', version: 1, capability: 'analyze', accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(context.subject.subjectId) as { original_path: string } | undefined;
            let boundaryData: unknown = null;
            let pathType = 'none';
            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    const simpleBorder = await detectSimpleBorder(asset.original_path);
                    boundaryData = simpleBorder ? { type: 'rectangle', box: simpleBorder } : { type: 'polygon', points: await detectDeepFrame(asset.original_path) };
                    pathType = simpleBorder ? 'fast' : 'deep';
                } catch (error) {
                    db.prepare("INSERT INTO processing_issues (id, asset_id, task, severity, message) VALUES (?, ?, 'frame_detection', 'warning', ?)")
                        .run(uuidv4(), context.subject.subjectId, error instanceof Error ? error.message : String(error));
                }
            }
            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(context.subject.subjectId, 'frame_detection');
            if (boundaryData) {
                db.prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data) VALUES (?, ?, 'frame_detection', 'border_detection_pipeline', '1.0', ?)")
                    .run(uuidv4(), context.subject.subjectId, JSON.stringify(boundaryData));
            }
            console.log(`[Telemetry] detect_frames executed on asset ${context.subject.subjectId} using ${pathType} path`);
            options.eventBus?.emit({ type: 'AssetUpdated', assetId: context.subject.subjectId });
            return { outputs: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }] };
        },
    };
}
