import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import type { DatabaseManager } from '../../../../../data/db';
import type { FacesDetected } from '@contracts/events';
import { RetinaFaceDetector } from '../../../../faces/retinaFaceDetector';
import { normalizeStoredPhotoBox } from '../../../../faces/faceImageGeometry';
import type { ModuleDefinition } from '../../../contracts';
import { getFrameInteriorBox } from '../../../../photoMetadata/frameUtils';
import { encodeMaskRaster, saveAssetMaskMetadata } from '../../../../photoEditing/assetMaskMetadata';
import type { PhotoMaskMetadataItem } from '../../../../../boundary/contracts/photoEditor';
import { resolveSegmentationProvider } from '../../../../segmentation/segmentationService';
import { prepareSegmentationImage } from '../../../../segmentation/imagePreparation';

export type DetectFacesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: FacesDetected) => void;
    };
};

async function toFaceMasks(params: { faces: Array<{ box: { x: number; y: number; width: number; height: number } }>; originalPath: string | undefined }): Promise<PhotoMaskMetadataItem[]> {
    const rasterByFace = new Map<number, PhotoMaskMetadataItem['raster']>();
    if (params.originalPath) {
        try {
            const provider = resolveSegmentationProvider({ provider: 'fastsam', profile: 'fast' }).used;
            const prepared = await provider.prepare(await prepareSegmentationImage(params.originalPath));
            try { for (const [index, face] of params.faces.entries()) { const mask = (await provider.segment(prepared, { positivePoints: [{ x: face.box.x + face.box.width / 2, y: face.box.y + face.box.height / 2 }] }))[0]; if (mask) { rasterByFace.set(index, await encodeMaskRaster(mask.alpha, mask.width, mask.height)); } } } finally { await prepared.dispose(); await provider.dispose(); }
        } catch {
            // Face boxes remain valid fallback masks when local segmentation is unavailable.
        }
    }
    return params.faces.map((face, index) => ({
        id: `face-${index}`,
        label: `Face ${index + 1}`,
        description: rasterByFace.has(index) ? 'Locally segmented person' : 'Locally detected face',
        kind: rasterByFace.has(index) ? 'raster' : 'ellipse',
        box: face.box,
        raster: rasterByFace.get(index),
        source: { moduleId: 'runtime.detect_faces', referenceId: `face-${index}` },
    }));
}
export function createDetectFacesModule(options: DetectFacesModuleOptions): ModuleDefinition {
    const detector = new RetinaFaceDetector();

    return {
        id: 'runtime.detect_faces',
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?')
                .get(context.subject.subjectId) as { original_path: string } | undefined;
            let faces: Array<{ id: string; box: { x: number; y: number; width: number; height: number }; score: number; landmarks: Array<{ x: number; y: number }> }> = [];

            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    const frameDetectionRow = db.prepare('SELECT data FROM derived_results WHERE asset_id = ? AND task = ?')
                        .get(context.subject.subjectId, 'frame_detection') as { data: string } | undefined;

                    let interiorBox: { x: number; y: number; width: number; height: number } | null = null;
                    if (frameDetectionRow) {
                        try {
                            const boundaryData = JSON.parse(frameDetectionRow.data);
                            interiorBox = getFrameInteriorBox(boundaryData);
                        } catch (e) {
                            console.error('Error parsing frame detection data:', e);
                        }
                    }

                    const detections = await detector.detect(asset.original_path, interiorBox);
                    faces = detections.flatMap((detection) => {
                        const normalizedBox = normalizeStoredPhotoBox(detection.box);
                        if (!normalizedBox) {
                            return [];
                        }

                        return [{
                            id: uuidv4(),
                            box: normalizedBox,
                            score: detection.score,
                            landmarks: detection.landmarks,
                        }];
                    });
                } catch (error) {
                    db.prepare(`
                        INSERT INTO processing_issues (id, asset_id, task, severity, message)
                        VALUES (?, ?, 'detection', 'warning', ?)
                    `).run(uuidv4(), context.subject.subjectId, (error as Error).message);
                }
            }

            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
                .run(context.subject.subjectId, 'face_detection');
            db.prepare(`
                INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
                VALUES (?, ?, 'face_detection', 'onnx_retina_10g', '1.0', ?)
            `).run(
                uuidv4(),
                context.subject.subjectId,
                JSON.stringify({ faces }),
            );
            saveAssetMaskMetadata(db, {
                assetId: context.subject.subjectId,
                sourceId: 'runtime.detect_faces',
                masks: await toFaceMasks({ faces, originalPath: asset?.original_path }),
            });
            options.eventBus?.emit({
                type: 'FacesDetected',
                mediaId: context.subject.subjectId,
                faceCount: faces.length,
                source: 'workflow_runtime',
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }] };
        },
    };
}
