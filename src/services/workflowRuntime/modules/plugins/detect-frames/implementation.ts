import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { ModuleDefinition } from '../../../contracts';
import { detectSimpleBorder } from '../../../../photoMetadata/borderDetection';
import { resolveSegmentationProvider } from '../../../../segmentation/segmentationService';
import { prepareSegmentationImage } from '../../../../segmentation/imagePreparation';
import type { SegmentationProvider } from '../../../../segmentation/contracts';
import { encodeMaskRaster, saveAssetMaskMetadata } from '../../../../photoEditing/assetMaskMetadata';
import type { PhotoMaskMetadataItem } from '../../../../../boundary/contracts/photoEditor';

export type DetectFramesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: { emit: (event: AssetUpdated) => void };
    providers?: SegmentationProvider[];
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

async function detectDeepFrame(originalPath: string, provider: SegmentationProvider): Promise<{ points: Array<{ x: number; y: number }>; raster: PhotoMaskMetadataItem['raster']; box: NonNullable<PhotoMaskMetadataItem['box']> }> {
    const prepared = await provider.prepare(await prepareSegmentationImage(originalPath));
    try {
        const result = (await provider.segment(prepared, { positivePoints: [{ x: 0.5, y: 0.5 }] }))[0];
        if (!result || result.box.width < 0.1 || result.box.height < 0.1 || result.box.width * result.box.height > 0.98) { throw new Error('Segmentation result is implausible for a photo frame.'); }
        const mask = Uint8Array.from(result.alpha, (value) => value > 0 ? 1 : 0);
        return { points: findContourPoints(mask, result.width, result.height), box: result.box, raster: await encodeMaskRaster(mask, result.width, result.height) };
    } finally { await prepared.dispose(); await provider.dispose(); }
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

type FrameRun = { boundaryData: unknown; pathType: 'fast' | 'deep' | 'none'; providerId: string; modelVersion: string; elapsedMs: number };
async function detectFrameForAsset(input: { originalPath: string; parameters: Record<string, unknown>; providers?: SegmentationProvider[] }): Promise<FrameRun> {
    const startedAt = Date.now();
    const mode = input.parameters.mode === 'deep' ? 'deep' : 'quick';
    const simpleBorder = await detectSimpleBorder(input.originalPath);
    if (mode === 'quick') { return { boundaryData: simpleBorder ? { type: 'rectangle', box: simpleBorder } : null, pathType: simpleBorder ? 'fast' : 'none', providerId: 'border_detection_pipeline', modelVersion: '1.0', elapsedMs: Date.now() - startedAt }; }
    if (simpleBorder && input.parameters.onlyWhenNeeded === true) { return { boundaryData: { type: 'rectangle', box: simpleBorder }, pathType: 'fast', providerId: 'border_detection_pipeline', modelVersion: '1.0', elapsedMs: Date.now() - startedAt }; }
    const resolution = resolveSegmentationProvider({ provider: (input.parameters.provider ?? input.parameters.frameProvider) as 'fastsam' | 'efficientsam' | 'auto' | undefined, profile: 'accurate', providers: input.providers });
    const deepFrame = await detectDeepFrame(input.originalPath, resolution.used);
    return { boundaryData: { type: 'polygon', provider: resolution.used.id, ...deepFrame }, pathType: 'deep', providerId: resolution.used.id, modelVersion: resolution.used.modelVersion, elapsedMs: Date.now() - startedAt };
}
function saveFrameResult(input: { db: ReturnType<DatabaseManager['getDb']>; assetId: string; result: FrameRun }): void {
    input.db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(input.assetId, 'frame_detection');
    if (input.result.boundaryData) {
        const data = { ...(input.result.boundaryData as Record<string, unknown>), provenance: { functionalModuleId: 'runtime.detect_frame', providerRequested: input.result.providerId, providerResolved: input.result.providerId, providerId: input.result.providerId, modelVersion: input.result.modelVersion, processingProfile: input.result.pathType === 'deep' ? 'deep' : 'quick', totalElapsedMs: input.result.elapsedMs, executedAt: new Date().toISOString() } };
        input.db.prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data) VALUES (?, ?, 'frame_detection', ?, ?, ?)").run(uuidv4(), input.assetId, input.result.providerId, input.result.modelVersion, JSON.stringify(data));
    }
    saveAssetMaskMetadata(input.db, { assetId: input.assetId, sourceId: 'runtime.detect_frame', masks: toFrameMasks(input.result.boundaryData) });
}

export function createDetectFramesModule(options: DetectFramesModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.detect_frame', version: 1, capability: 'analyze', accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(context.subject.subjectId) as { original_path: string } | undefined;
            let result: FrameRun | undefined;
            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    result = await detectFrameForAsset({ originalPath: asset.original_path, parameters: context.parameters, providers: options.providers });
                } catch (error) {
                    db.prepare("INSERT INTO processing_issues (id, asset_id, task, severity, message, details) VALUES (?, ?, 'frame_detection', 'warning', ?, ?)")
                        .run(uuidv4(), context.subject.subjectId, error instanceof Error ? error.message : String(error), JSON.stringify({ functionalModuleId: 'runtime.detect_frame', parameters: context.parameters }));
                }
            }
            if (result) {
                // A completed quick/deep run, including no frame found, owns its scoped replacement.
                saveFrameResult({ db, assetId: context.subject.subjectId, result });
                db.prepare("DELETE FROM processing_issues WHERE asset_id = ? AND task = 'frame_detection'").run(context.subject.subjectId);
                console.log(`[Telemetry] detect_frames executed on asset ${context.subject.subjectId} using ${result.pathType} path`);
            }
            options.eventBus?.emit({ type: 'AssetUpdated', assetId: context.subject.subjectId });
            return { outputs: [{ kind: 'artifact', artifactType: 'frame_detection', subjectType: 'asset' }] };
        },
    };
}
