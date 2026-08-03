import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { ModuleDefinition } from '../../../contracts';
import { detectSimpleBorder } from '../../../../photoMetadata/borderDetection';
import { initImageSegmentation, segmentPhotoFromFrame } from '../../../../faces/imageSegmentation';
import { encodeMaskRaster, saveAssetMaskMetadata } from '../../../../photoEditing/assetMaskMetadata';
import type { PhotoMaskMetadataItem } from '../../../../../boundary/contracts/photoEditor';

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

async function detectDeepFrame(originalPath: string): Promise<{ points: Array<{ x: number; y: number }>; raster: PhotoMaskMetadataItem['raster'] }> {
    await initImageSegmentation();
    const size = 1024;
    const image = await sharp(originalPath).rotate().resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Float32Array(3 * size * size);
    for (let index = 0; index < size * size; index += 1) {
        pixels[index] = image.data[index * 3] / 255;
        pixels[index + size * size] = image.data[index * 3 + 1] / 255;
        pixels[index + (2 * size * size)] = image.data[index * 3 + 2] / 255;
    }
    const mask = await segmentPhotoFromFrame(pixels, size, size);
    return { points: findContourPoints(mask, size, size), raster: await encodeMaskRaster(mask, size, size) };
}

function frameMaskGeometry(boundary: { type?: string; box?: PhotoMaskMetadataItem['box']; points?: PhotoMaskMetadataItem['points']; raster?: PhotoMaskMetadataItem['raster'] }) {
    if (boundary.raster) {return { kind: 'raster' as const, box: boundary.box, points: boundary.points, raster: boundary.raster };}
    if (boundary.type === 'polygon' && boundary.points && boundary.points.length >= 3) {return { kind: 'polygon' as const, points: boundary.points };}
    if (boundary.type === 'rectangle' && boundary.box) {return { kind: 'rectangle' as const, box: boundary.box };}
    return null;
}

function toFrameMasks(boundaryData: unknown): PhotoMaskMetadataItem[] {
    if (!boundaryData || typeof boundaryData !== 'object') {return [];}
    const boundary = boundaryData as { type?: string; box?: PhotoMaskMetadataItem['box']; points?: PhotoMaskMetadataItem['points']; raster?: PhotoMaskMetadataItem['raster'] };
    const geometry = frameMaskGeometry(boundary);
    if (!geometry) {return [];}
    return [
        {
            id: 'photo-content',
            label: 'Detected photo area',
            description: 'Detected photo area from frame segmentation',
            ...geometry,
            source: { moduleId: 'runtime.detect_frame', referenceId: 'photo-content' },
        },
        {
            id: 'outside-photo-content',
            label: 'Outside detected photo',
            description: 'Area outside the detected photo boundary',
            ...geometry,
            inverted: true,
            source: { moduleId: 'runtime.detect_frame', referenceId: 'outside-photo-content' },
        },
    ];
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
                    if (simpleBorder) {
                        boundaryData = { type: 'rectangle', box: simpleBorder };
                    } else {
                        const deepFrame = await detectDeepFrame(asset.original_path);
                        boundaryData = { type: 'polygon', ...deepFrame };
                    }
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
            saveAssetMaskMetadata(db, {
                assetId: context.subject.subjectId,
                sourceId: 'runtime.detect_frame',
                masks: toFrameMasks(boundaryData),
            });
            console.log(`[Telemetry] detect_frames executed on asset ${context.subject.subjectId} using ${pathType} path`);
            options.eventBus?.emit({ type: 'AssetUpdated', assetId: context.subject.subjectId });
            return { outputs: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }] };
        },
    };
}
