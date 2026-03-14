import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../data/db';
import type { FacesDetected } from '@contracts/events';
import type { ModuleDefinition } from '../contracts';

export interface DetectFacesModuleOptions {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: FacesDetected) => void;
    };
}

export function createDetectFacesModule(options: DetectFacesModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.detect_faces',
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
                .run(context.subject.subjectId, 'face_detection');
            db.prepare(`
                INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
                VALUES (?, ?, 'face_detection', 'runtime_stub', '1.0', ?)
            `).run(
                uuidv4(),
                context.subject.subjectId,
                JSON.stringify({
                    faces: [
                        {
                            id: uuidv4(),
                            box: [0.1, 0.1, 0.9, 0.9],
                            score: 0.99,
                            landmarks: [],
                        },
                    ],
                }),
            );
            options.eventBus?.emit({
                type: 'FacesDetected',
                mediaId: context.subject.subjectId,
                faceCount: 1,
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'face_detection', subjectType: 'asset' }] };
        },
    };
}
