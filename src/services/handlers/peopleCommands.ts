import { v4 as uuidv4 } from 'uuid';
import type { CommandHandlerMap } from './types';

export const peopleCommandHandlers: CommandHandlerMap = {
    rename_person: (ctx) => {
        const { id, payload, originWs, dbManager, eventBus, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const { newName, personId } = payload as { newName: string; personId: string };
            db.transaction(() => {
                db.prepare(`
                    INSERT OR REPLACE INTO manual_face_names (original_path, face_index, name)
                    SELECT a.original_path, fa.face_index, ?
                    FROM face_assignments fa
                    JOIN assets a ON a.id = fa.asset_id
                    WHERE fa.person_id = ?
                `).run(newName, personId);
                db.prepare('UPDATE people SET name = ? WHERE id = ?').run(newName, personId);
            })();
            respond(id, 'ok', { message: 'Person renamed' }, null, originWs);
            eventBus.emit({ type: 'JobCompleted', jobId: 'rename', pipelineStage: 'analysis' });
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    merge_people: (ctx) => {
        const { id, payload, originWs, dbManager, eventBus, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const { personIds, targetName } = payload as { personIds: string[]; targetName: string };
            if (!personIds || personIds.length < 2) {throw new Error('Need at least 2 people to merge');}

            db.transaction(() => {
                const canonicalId = personIds[0];
                for (const personId of personIds) {
                    db.prepare(`
                        INSERT OR REPLACE INTO manual_face_names (original_path, face_index, name)
                        SELECT a.original_path, fa.face_index, ?
                        FROM face_assignments fa
                        JOIN assets a ON a.id = fa.asset_id
                        WHERE fa.person_id = ?
                    `).run(targetName, personId);
                }

                db.prepare('UPDATE people SET name = ? WHERE id = ?').run(targetName, canonicalId);
                for (let i = 1; i < personIds.length; i += 1) {
                    db.prepare('UPDATE face_assignments SET person_id = ? WHERE person_id = ?').run(canonicalId, personIds[i]);
                    db.prepare('DELETE FROM people WHERE id = ?').run(personIds[i]);
                }
            })();

            respond(id, 'ok', { message: 'People merged' }, null, originWs);
            eventBus.emit({ type: 'JobCompleted', jobId: 'merge', pipelineStage: 'analysis' });
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    isolate_face: (ctx) => {
        const { id, payload, originWs, dbManager, eventBus, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const { assetId, faceIndex } = payload as { assetId: string; faceIndex: number };
            db.transaction(() => {
                db.prepare(`
                    INSERT OR REPLACE INTO manual_face_isolations (original_path, face_index)
                    SELECT original_path, ? FROM assets WHERE id = ?
                `).run(faceIndex, assetId);

                db.prepare(`
                    DELETE FROM manual_face_names
                    WHERE original_path = (SELECT original_path FROM assets WHERE id = ?) AND face_index = ?
                `).run(assetId, faceIndex);

                const newPersonId = uuidv4();
                db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)').run(newPersonId, 'Unknown Person', null);
                db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?').run(newPersonId, assetId, faceIndex);
            })();
            respond(id, 'ok', { message: 'Face isolated' }, null, originWs);
            eventBus.emit({ type: 'JobCompleted', jobId: 'isolate', pipelineStage: 'analysis' });
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    isolate_person_asset: (ctx) => {
        const { id, payload, originWs, dbManager, eventBus, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const { assetId, personId } = payload as { assetId: string; personId: string };
            db.transaction(() => {
                const faces = db.prepare('SELECT face_index FROM face_assignments WHERE asset_id = ? AND person_id = ?').all(assetId, personId) as { face_index: number }[];
                for (const face of faces) {
                    db.prepare(`
                        INSERT OR REPLACE INTO manual_face_isolations (original_path, face_index, from_person_id)
                        SELECT original_path, ?, ? FROM assets WHERE id = ?
                    `).run(face.face_index, personId, assetId);

                    db.prepare(`
                        DELETE FROM manual_face_names
                        WHERE original_path = (SELECT original_path FROM assets WHERE id = ?) AND face_index = ?
                    `).run(assetId, face.face_index);

                    const newPersonId = uuidv4();
                    db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)').run(newPersonId, 'Unknown Person', null);
                    db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?').run(newPersonId, assetId, face.face_index);
                }
            })();
            respond(id, 'ok', { message: 'Photos untagged' }, null, originWs);
            eventBus.emit({ type: 'JobCompleted', jobId: 'untag_asset', pipelineStage: 'analysis' });
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_people: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const people = dbManager.getDb().prepare(`
                SELECT p.id, p.name, COUNT(DISTINCT fa.asset_id) as face_count,
                       (
                           SELECT COUNT(DISTINCT a2.id)
                           FROM manual_face_isolations mfi
                           JOIN assets a2 ON a2.original_path = mfi.original_path
                           WHERE mfi.from_person_id = p.id
                       ) as rejected_count,
                       COALESCE(p.thumbnail_path, (
                           SELECT path FROM previews
                           WHERE asset_id = (
                               SELECT asset_id FROM face_assignments fa2
                               WHERE fa2.person_id = p.id
                               ORDER BY fa2.confidence DESC LIMIT 1
                           ) AND size = 'thumbnail' LIMIT 1
                       )) as cover_image
                FROM people p
                LEFT JOIN face_assignments fa ON fa.person_id = p.id
                GROUP BY p.id
                ORDER BY face_count DESC
            `).all() as { id: string; name: string; face_count: number; rejected_count: number; cover_image: string | null }[];
            respond(id, 'ok', { people }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_rejected_assets_for_person: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { personId } = payload as { personId: string };
            const assets = dbManager.getDb().prepare(`
                SELECT a.id, a.original_path, a.width, a.height,
                       p.path as preview_path
                FROM manual_face_isolations mfi
                JOIN assets a ON a.original_path = mfi.original_path
                LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                WHERE mfi.from_person_id = ?
                GROUP BY a.id
                ORDER BY mfi.created_at ASC
            `).all(personId) as { id: string; original_path: string; width: number; height: number; preview_path: string | null }[];
            respond(id, 'ok', { assets }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
