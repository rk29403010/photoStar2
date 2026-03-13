import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../data/db';
import type { ModuleDefinition } from '../contracts';

function ensurePerson(db: ReturnType<DatabaseManager['getDb']>): string {
    const existing = db.prepare('SELECT id FROM people ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
    if (existing) {
        return existing.id;
    }

    const personId = uuidv4();
    db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)')
        .run(personId, 'Unknown Person', null);
    return personId;
}

export interface ResolvePeopleModuleOptions {
    dbManager: DatabaseManager;
}

export function createResolvePeopleModule(options: ResolvePeopleModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.resolve_people',
        version: 1,
        capability: 'group',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'person_resolution', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const personId = ensurePerson(db);

            db.prepare('DELETE FROM face_assignments').run();
            for (const subject of context.batchSubjects) {
                const detection = db.prepare(
                    "SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'"
                ).get(subject.subjectId) as { data: string } | undefined;
                const faces = detection ? JSON.parse(detection.data).faces ?? [] : [];
                if (faces.length === 0) {
                    continue;
                }
                db.prepare(`
                    INSERT OR REPLACE INTO face_assignments (asset_id, face_index, person_id, confidence)
                    VALUES (?, ?, ?, ?)
                `).run(subject.subjectId, 0, personId, 0.99);
            }

            return { outputs: [{ kind: 'artifact', artifactType: 'person_resolution', subjectType: 'asset' }] };
        },
    };
}
