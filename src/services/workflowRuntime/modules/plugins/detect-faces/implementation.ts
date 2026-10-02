import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../../../data/db';
import type { FacesDetected } from '@contracts/events';
import { RetinaFaceDetector } from '../../../../faces/retinaFaceDetector';
import { normalizeStoredPhotoBox } from '../../../../faces/faceImageGeometry';
import {
    reconcileAndPersistStableFaceDetections,
    RETINAFACE_10G_RECONCILIATION_POLICY,
} from '../../../../faces/faceReconciliation';
import type { ModuleDefinition } from '../../../contracts';
import { getFrameInteriorBox } from '../../../../photoMetadata/frameUtils';
import { saveAssetMaskMetadata } from '../../../../photoEditing/assetMaskMetadata';
import type { PhotoMaskMetadataItem } from '../../../../../boundary/contracts/photoEditor';

const FACE_DETECTOR_MODULE_ID = 'runtime.detect_faces';
const FACE_DETECTOR_PROVIDER = 'onnx_retina_10g';
const FACE_DETECTOR_MODEL_VERSION = '1.0';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type FaceBox = { x: number; y: number; width: number; height: number };
type DetectedFace = {
    id: string;
    box: FaceBox;
    score: number;
    landmarks: Array<{ x: number; y: number }>;
};
type SourceImageMetadata = {
    width: number;
    height: number;
    orientation: number;
};
type DetectionState = {
    faces: DetectedFace[];
    sourceImageMetadata: SourceImageMetadata | null;
};

export type DetectFacesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: FacesDetected) => void;
    };
};

function loadFrameInteriorBox(db: DbHandle, assetId: string): FaceBox | null {
    const row = db.prepare('SELECT data FROM derived_results WHERE asset_id = ? AND task = ?')
        .get(assetId, 'frame_detection') as { data: string } | undefined;
    if (!row) {
        return null;
    }
    try {
        return getFrameInteriorBox(JSON.parse(row.data));
    } catch (error) {
        console.error('Error parsing frame detection data:', error);
        return null;
    }
}

async function detectAssetFaces(
    detector: RetinaFaceDetector,
    assetPath: string,
    interiorBox: FaceBox | null,
): Promise<DetectionState> {
    const metadata = await sharp(assetPath).metadata();
    if (!metadata.width || !metadata.height) {
        throw new Error('Unable to determine source dimensions for face detection.');
    }
    const detections = await detector.detect(assetPath, interiorBox);
    const faces = detections.flatMap((detection) => {
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
    return {
        faces,
        sourceImageMetadata: {
            width: metadata.width,
            height: metadata.height,
            orientation: metadata.orientation ?? 1,
        },
    };
}

function recordDetectionIssue(db: DbHandle, assetId: string, error: unknown): void {
    db.prepare(`
        INSERT INTO processing_issues (id, asset_id, task, severity, message)
        VALUES (?, ?, 'detection', 'warning', ?)
    `).run(uuidv4(), assetId, (error as Error).message);
}

function toFaceMasks(faces: readonly DetectedFace[], visualRegionIds: readonly string[]): PhotoMaskMetadataItem[] {
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

function persistFaceDetection(db: DbHandle, assetId: string, state: DetectionState): void {
    const faceDetectionResultId = uuidv4();
    db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
        .run(assetId, 'face_detection');
    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'face_detection', ?, ?, ?)
    `).run(
        faceDetectionResultId,
        assetId,
        FACE_DETECTOR_PROVIDER,
        FACE_DETECTOR_MODEL_VERSION,
        JSON.stringify({ faces: state.faces }),
    );

    const stableFaceIdentities = state.sourceImageMetadata
        ? reconcileAndPersistStableFaceDetections(db, {
            assetId,
            sourceAnalysisGenerationId: faceDetectionResultId,
            detections: state.faces.map((face) => ({
                detectionId: face.id,
                box: face.box,
                landmarks: face.landmarks,
            })),
            sourceWidth: state.sourceImageMetadata.width,
            sourceHeight: state.sourceImageMetadata.height,
            sourceOrientation: state.sourceImageMetadata.orientation,
            sourceModuleId: FACE_DETECTOR_MODULE_ID,
            provider: FACE_DETECTOR_PROVIDER,
            modelVersion: FACE_DETECTOR_MODEL_VERSION,
            policy: RETINAFACE_10G_RECONCILIATION_POLICY,
        })
        : [];

    saveAssetMaskMetadata(db, {
        assetId,
        sourceId: FACE_DETECTOR_MODULE_ID,
        masks: toFaceMasks(
            state.faces,
            stableFaceIdentities.map((identity) => identity.visualRegionId),
        ),
    });
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
            const assetId = context.subject.subjectId;
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?')
                .get(assetId) as { original_path: string } | undefined;
            let state: DetectionState = { faces: [], sourceImageMetadata: null };

            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    state = await detectAssetFaces(
                        detector,
                        asset.original_path,
                        loadFrameInteriorBox(db, assetId),
                    );
                } catch (error) {
                    recordDetectionIssue(db, assetId, error);
                }
            }

            persistFaceDetection(db, assetId, state);
            options.eventBus?.emit({
                type: 'FacesDetected',
                mediaId: assetId,
                faceCount: state.faces.length,
                source: 'workflow_runtime',
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }] };
        },
    };
}
