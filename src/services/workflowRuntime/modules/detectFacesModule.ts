import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import type { DatabaseManager } from '../../../data/db';
import type { FacesDetected } from '@contracts/events';
import { RetinaFaceDetector } from '../../faces/retinaFaceDetector';
import { normalizeStoredPhotoBox } from '../../faces/faceImageGeometry';
import type { ModuleDefinition } from '../contracts';
import { getFrameInteriorBox } from '../../photoMetadata/frameUtils';

export type DetectFacesModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: FacesDetected) => void;
    };
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
