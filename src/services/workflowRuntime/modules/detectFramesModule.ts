import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../data/db';
import type { AssetUpdated } from '../../events/types';
import type { ModuleDefinition } from '../contracts';
import { detectSimpleBorder } from '../../photoMetadata/borderDetection';
import { segmentPhotoFromFrame, initImageSegmentation } from '../../faces/imageSegmentation';

export type DetectFramesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: AssetUpdated) => void;
    };
};

function isPixelOnBoundary(mask: Uint8Array, x: number, y: number, width: number, height: number): boolean {
    const idx = y * width + x;
    if (mask[idx] !== 1) {
        return false;
    }
    return x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
        mask[idx - 1] === 0 || mask[idx + 1] === 0 ||
        mask[idx - width] === 0 || mask[idx + width] === 0;
}

function findContourPoints(mask: Uint8Array, width: number, height: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isPixelOnBoundary(mask, x, y, width, height)) {
                points.push({ x: x / width, y: y / height });
            }
        }
    }
    // Downsample points to avoid huge database payload (max 100 points)
    if (points.length > 100) {
        const step = Math.ceil(points.length / 100);
        return points.filter((_, i) => i % step === 0);
    }
    return points;
}

export function createDetectFramesModule(options: DetectFramesModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.detect_frames',
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }],
        run: async (context) => {
            const startTime = performance.now();
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?')
                .get(context.subject.subjectId) as { original_path: string } | undefined;

            let boundaryData: unknown = null;
            let pathType: 'fast' | 'deep' | 'none' = 'none';

            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    // 1. Fast Path: Execute detectSimpleBorder
                    const simpleBorder = await detectSimpleBorder(asset.original_path);
                    if (simpleBorder) {
                        boundaryData = {
                            type: 'rectangle',
                            box: simpleBorder
                        };
                        pathType = 'fast';
                    } else {
                        // 2. Deep Path: Execute segmentPhotoFromFrame
                        await initImageSegmentation();
                        const image = sharp(asset.original_path);
                        const TARGET_WIDTH = 1024;
                        const TARGET_HEIGHT = 1024;

                        const resizedImage = await image
                            .rotate()
                            .resize(TARGET_WIDTH, TARGET_HEIGHT, {
                                fit: 'fill',
                            })
                            .removeAlpha()
                            .raw()
                            .toBuffer({ resolveWithObject: true });

                        const float32Data = new Float32Array(3 * TARGET_HEIGHT * TARGET_WIDTH);
                        for (let index = 0; index < TARGET_HEIGHT * TARGET_WIDTH; index += 1) {
                            float32Data[index] = resizedImage.data[index * 3] / 255.0;
                            float32Data[index + TARGET_HEIGHT * TARGET_WIDTH] = resizedImage.data[index * 3 + 1] / 255.0;
                            float32Data[index + 2 * TARGET_HEIGHT * TARGET_WIDTH] = resizedImage.data[index * 3 + 2] / 255.0;
                        }

                        const mask = await segmentPhotoFromFrame(float32Data, TARGET_WIDTH, TARGET_HEIGHT);
                        const polygon = findContourPoints(mask, TARGET_WIDTH, TARGET_HEIGHT);
                        boundaryData = {
                            type: 'polygon',
                            points: polygon
                        };
                        pathType = 'deep';
                    }
                } catch (error) {
                    db.prepare(`
                        INSERT INTO processing_issues (id, asset_id, task, severity, message)
                        VALUES (?, ?, 'frame_detection', 'warning', ?)
                    `).run(uuidv4(), context.subject.subjectId, (error as Error).message);
                }
            }

            // Save the resulting boundary data to the database
            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
                .run(context.subject.subjectId, 'frame_detection');

            if (boundaryData) {
                db.prepare(`
                    INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
                    VALUES (?, ?, 'frame_detection', 'border_detection_pipeline', '1.0', ?)
                `).run(
                    uuidv4(),
                    context.subject.subjectId,
                    JSON.stringify(boundaryData)
                );
            }

            // Log execution time using performance.now()
            const durationMs = performance.now() - startTime;
            console.log(`[Telemetry] detect_frames executed on asset ${context.subject.subjectId} using ${pathType} path in ${durationMs.toFixed(2)}ms`);

            options.eventBus?.emit({
                type: 'AssetUpdated',
                assetId: context.subject.subjectId,
            });

            return { outputs: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }] };
        },
    };
}
