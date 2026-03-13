import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../data/db';
import type { ModuleDefinition } from '../contracts';

export interface GenerateFaceVectorsModuleOptions {
    dbManager: DatabaseManager;
}

export function createGenerateFaceVectorsModule(options: GenerateFaceVectorsModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.generate_face_vectors',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const detection = db.prepare(
                "SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'"
            ).get(context.subject.subjectId) as { data: string } | undefined;
            const faces = detection ? JSON.parse(detection.data).faces ?? [] : [];
            const embeddings = faces.map(() => [1, 0, 0, 1]);

            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?')
                .run(context.subject.subjectId, 'face_recognition');
            db.prepare(`
                INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
                VALUES (?, ?, 'face_recognition', 'runtime_stub', '1.0', ?)
            `).run(uuidv4(), context.subject.subjectId, JSON.stringify({ embeddings }));
            return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
        },
    };
}
