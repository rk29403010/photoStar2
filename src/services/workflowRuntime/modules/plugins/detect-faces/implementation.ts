import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../../../data/db';
import type { FacesDetected } from '@contracts/events';
import { RetinaFaceDetector } from '../../../../faces/retinaFaceDetector';
import { normalizeStoredPhotoBox } from '../../../../faces/faceImageGeometry';
import { createStableFaceDetection } from '../../../../faces/stableFaceRepository';
import type { ModuleDefinition } from '../../../contracts';
import { getFrameInteriorBox } from '../../../../photoMetadata/frameUtils';
import { saveAssetMaskMetadata } from '../../../../photoEditing/assetMaskMetadata';
import type { PhotoMaskMetadataItem } from '../../../../../boundary/contracts/photoEditor';

const FACE_DETECTOR_MODULE_ID = 'runtime.detect_faces';
const FACE_DETECTOR_PROVIDER = 'onnx_retina_10g';
const FACE_DETECTOR_MODEL_VERSION = '1.0';

export type DetectFacesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: FacesDetected) => void;
    };
};

type SourceImageMetadata = {
    width: number;
    height: number;
    orientation: number;
};

function toFaceMasks(
    faces: Array<{ box: { x: number; y: number; width: number; height: number } }>,
    visualRegionIds: readonly string[],
): PhotoMaskMetadataItem[] {
    return faces.map((face, index) => ({
        id: `face-${index}`,
        label: `Face ${index + 1}`,
        description: 'Locally detected face',
        kind: 'ellipse',
        box: face.box,
        visualRegionId: visualRegionIds[index],
        source: { moduleId: FACE_DETECTOR_MODULE_ID, referenceId: `face-${index}` },
    }));
}
export function createDetectFacesModule(options: DetectFacesModuleOptions): ModuleDefinition {
    const detector = new RetinaFaceDetector();

    return {
        id: FACE_DETECTOR_MODULE_ID,
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?')
                .get(context.subject.subjectId) as { original_path: string } | undefined;
            let faces: Array<{ id: string; box: { x: number; y: number; width: number; height: number }; score: number; landmarks: Array<{ x: number; y: number }> }> = [];
            let sourceImageMetadata: SourceImageMetadata | null = null;

            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    const metadata = await sharp(asset.original_path).metadata();
                    if (!metadata.width || !metadata.height) {
                        throw new Error('Unable to determine source dimensions for face detection.');
                    }
                    sourceImageMetadata = {
                        width: metadata.width,
                        height: metadata.height,
                        orientation: metadata.orientation ?? 1,
                    };

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

            const faceDetectionResultId = uuidv4();
            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
                .run(context.subject.subjectId, 'face_detection');
            db.prepare(`
                INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
                VALUES (?, ?, 'face_detection', ?, ?, ?)
            `).run(
                faceDetectionResultId,
                context.subject.subjectId,
                FACE_DETECTOR_PROVIDER,
                FACE_DETECTOR_MODEL_VERSION,
                JSON.stringify({ faces }),
            );

            const stableFaceIdentities = sourceImageMetadata
                ? faces.map((face) => createStableFaceDetection(db, {
                    assetId: context.subject.subjectId,
                    sourceAnalysisGenerationId: faceDetectionResultId,
                    box: face.box,
                    sourceWidth: sourceImageMetadata.width,
                    sourceHeight: sourceImageMetadata.height,
                    sourceOrientation: sourceImageMetadata.orientation,
                    sourceModuleId: FACE_DETECTOR_MODULE_ID,
                    provider: FACE_DETECTOR_PROVIDER,
                    modelVersion: FACE_DETECTOR_MODEL_VERSION,
                }))
                : [];

            saveAssetMaskMetadata(db, {
                assetId: context.subject.subjectId,
                sourceId: FACE_DETECTOR_MODULE_ID,
                masks: toFaceMasks(
                    faces,
                    stableFaceIdentities.map((identity) => identity.visualRegionId),
                ),
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
