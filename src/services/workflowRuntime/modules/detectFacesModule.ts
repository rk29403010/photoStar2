import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'node:fs';
import type { DatabaseManager } from '../../../data/db';
import type { FacesDetected } from '@contracts/events';
import { RetinaFaceDetector } from '../../faces/retinaFaceDetector';
import type { ModuleDefinition } from '../contracts';

export interface DetectFacesModuleOptions {
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
            let faces: Array<{ id: string; box: [number, number, number, number]; score: number; landmarks: Array<{ x: number; y: number }> }> = [];

            if (asset?.original_path && existsSync(asset.original_path)) {
                try {
                    const detections = await detector.detect(asset.original_path);
                    faces = detections.map((detection) => ({
                        id: uuidv4(),
                        box: detection.box,
                        score: detection.score,
                        landmarks: detection.landmarks,
                    }));
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
