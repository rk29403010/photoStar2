import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../data/db';
import type { ModuleDefinition } from '../contracts';

export interface GroupSimilarPhotosModuleOptions {
    dbManager: DatabaseManager;
}

export function createGroupSimilarPhotosModule(options: GroupSimilarPhotosModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.group_similar_photos',
        version: 1,
        capability: 'group',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            if (context.batchSubjects.length === 0) {
                return { outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }] };
            }

            const groupId = uuidv4();
            db.prepare('DELETE FROM asset_group_members').run();
            db.prepare("DELETE FROM asset_groups WHERE type = 'people'").run();
            db.prepare(`
                INSERT INTO asset_groups (id, type, status, title, created_at, updated_at)
                VALUES (?, 'people', 'confirmed', ?, ?, ?)
            `).run(groupId, 'Folder ingest people group', new Date().toISOString(), new Date().toISOString());

            for (const [index, subject] of context.batchSubjects.entries()) {
                db.prepare(`
                    INSERT INTO asset_group_members (group_id, asset_id, role, rank, created_at)
                    VALUES (?, ?, 'member', ?, ?)
                `).run(groupId, subject.subjectId, index, new Date().toISOString());
            }

            return { outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }] };
        },
    };
}
