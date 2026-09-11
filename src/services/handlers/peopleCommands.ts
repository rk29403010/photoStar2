import { v4 as uuidv4 } from 'uuid';
import {
    acceptCurrentAssignmentsForPerson,
    getRejectedAssetIdsForPerson,
    recordManualFacePersonDecision,
    recordManualFacePersonDecisionByFaceId,
    resolveStableFaceAtLegacyPosition,
    resolveStableFaceById,
    updateSemanticPersonLabel,
} from '../faces/manualFaceSemanticRepository';
import type { CommandHandlerMap } from './types';

type StableFaceActionPayload = {
    faceId?: string;
    assetId?: string;
    faceIndex?: number;
};

function resolveFaceActionTarget(
    db: Parameters<typeof resolveStableFaceById>[0],
    payload: StableFaceActionPayload,
) {
    if (payload.faceId) {
        return resolveStableFaceById(db, payload.faceId);
    }
    if (payload.assetId && Number.isInteger(payload.faceIndex)) {
        return resolveStableFaceAtLegacyPosition(db, payload.assetId, payload.faceIndex!);
    }
    throw new Error('A stable faceId is required for this face action.');
}

export const peopleCommandHandlers: CommandHandlerMap = {
    rename_person: (ctx) => {
        const { id, payload, originWs, dbManager, eventBus, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const { newName, personId } = payload as { newName: string; personId: string };
            db.transaction(() => {
                acceptCurrentAssignmentsForPerson(db, personId, newName, 'people.rename');
                updateSemanticPersonLabel(db, personId, newName);
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
                updateSemanticPersonLabel(db, canonicalId, targetName);
                for (const personId of personIds) {
                    const rows = db.prepare(`
                        SELECT asset_id, face_index
                        FROM face_assignments
                        WHERE person_id = ?
                    `).all(personId) as Array<{ asset_id: string; face_index: number }>;
                    for (const row of rows) {
                        recordManualFacePersonDecision(db, {
                            assetId: row.asset_id,
                            faceIndex: row.face_index,
                            personId: canonicalId,
                            personName: targetName,
                            status: 'accepted',
                            sourceRef: 'people.merge',
                        });
                    }
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
            const target = resolveFaceActionTarget(db, payload as StableFaceActionPayload);
            db.transaction(() => {
                const newPersonId = uuidv4();
                recordManualFacePersonDecisionByFaceId(db, {
                    faceId: target.faceId,
                    personId: newPersonId,
                    personName: 'Unknown Person',
                    status: 'accepted',
                    sourceRef: 'people.isolate_face',
                });
                db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)')
                    .run(newPersonId, 'Unknown Person', null);
                db.prepare('UPDATE face_assignments SET person_id = ?, is_suggested = 0 WHERE asset_id = ? AND face_index = ?')
                    .run(newPersonId, target.assetId, target.faceIndex);
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
                const faces = db.prepare('SELECT face_index FROM face_assignments WHERE asset_id = ? AND person_id = ?')
                    .all(assetId, personId) as Array<{ face_index: number }>;
                for (const face of faces) {
                    recordManualFacePersonDecision(db, {
                        assetId,
                        faceIndex: face.face_index,
                        personId,
                        status: 'rejected',
                        sourceRef: 'people.isolate_person_asset',
                    });
                    const newPersonId = uuidv4();
                    recordManualFacePersonDecision(db, {
                        assetId,
                        faceIndex: face.face_index,
                        personId: newPersonId,
                        personName: 'Unknown Person',
                        status: 'accepted',
                        sourceRef: 'people.isolate_person_asset',
                    });
                    db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)')
                        .run(newPersonId, 'Unknown Person', null);
                    db.prepare('UPDATE face_assignments SET person_id = ?, is_suggested = 0 WHERE asset_id = ? AND face_index = ?')
                        .run(newPersonId, assetId, face.face_index);
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
            const db = dbManager.getDb();
            const people = db.prepare(`
                SELECT p.id, p.name, p.birth_date, p.death_date,
                       COUNT(DISTINCT CASE WHEN fa.is_suggested = 0 THEN fa.asset_id END) as face_count,
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
                               WHERE fa2.person_id = p.id AND fa2.is_suggested = 0
                               ORDER BY fa2.confidence DESC LIMIT 1
                           ) AND size = 'thumbnail' LIMIT 1
                       )) as cover_image
                FROM people p
                LEFT JOIN face_assignments fa ON fa.person_id = p.id
                GROUP BY p.id
                ORDER BY face_count DESC
            `).all() as { id: string; name: string; birth_date: string | null; death_date: string | null; face_count: number; rejected_count: number; cover_image: string | null }[];

            const links = db.prepare(`
                SELECT person_id as personId, gedcom_tree_id as treeId, gedcom_person_id as personIdInTree
                FROM people_gedcom_links
            `).all() as { personId: string; treeId: string; personIdInTree: string }[];

            const peopleWithLinks = people.map(p => {
                const pLinks = links
                    .filter(l => l.personId === p.id)
                    .map(l => ({ treeId: l.treeId, personId: l.personIdInTree }));
                const rejectedCount = getRejectedAssetIdsForPerson(db, p.id).length;
                return {
                    ...p,
                    rejected_count: rejectedCount,
                    birth_date: p.birth_date || undefined,
                    death_date: p.death_date || undefined,
                    gedcom_links: pLinks.length > 0 ? pLinks : undefined
                };
            });

            respond(id, 'ok', { people: peopleWithLinks }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_rejected_assets_for_person: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { personId } = payload as { personId: string };
            const db = dbManager.getDb();
            const semanticAssetIds = getRejectedAssetIdsForPerson(db, personId);
            const semanticAssets = semanticAssetIds.map((assetId) => db.prepare(`
                SELECT a.id, a.original_path, a.width, a.height,
                       p.path as preview_path
                FROM assets a
                LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                WHERE a.id = ?
                LIMIT 1
            `).get(assetId)).filter(Boolean);
            const legacyAssets = db.prepare(`
                SELECT a.id, a.original_path, a.width, a.height,
                       p.path as preview_path
                FROM manual_face_isolations mfi
                JOIN assets a ON a.original_path = mfi.original_path
                LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                WHERE mfi.from_person_id = ?
                GROUP BY a.id
                ORDER BY mfi.created_at ASC
            `).all(personId);
            const byId = new Map([...legacyAssets, ...semanticAssets].map((asset) => [(asset as { id: string }).id, asset]));
            respond(id, 'ok', { assets: [...byId.values()] }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_person_face_assignments: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { personId } = payload as { personId: string };
            const db = dbManager.getDb();
            const rows = db.prepare(`
                SELECT fa.asset_id, fa.face_index, fa.confidence, fa.is_suggested,
                       a.original_path,
                       p.path as preview_path
                FROM face_assignments fa
                JOIN assets a ON a.id = fa.asset_id
                LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                WHERE fa.person_id = ?
                ORDER BY fa.confidence DESC
            `).all(personId) as Array<{
                asset_id: string;
                face_index: number;
                confidence: number;
                is_suggested: number;
                original_path: string;
                preview_path: string | null;
            }>;
            const assignments = rows.map((row) => {
                const stable = resolveStableFaceAtLegacyPosition(db, row.asset_id, row.face_index);
                return {
                    ...row,
                    face_id: stable.faceId,
                    visual_region_id: stable.visualRegionId,
                };
            });
            respond(id, 'ok', { assignments }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    confirm_face_assignment: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const target = resolveFaceActionTarget(db, payload as StableFaceActionPayload);
            const assignment = db.prepare(`
                SELECT fa.person_id, p.name
                FROM face_assignments fa
                JOIN people p ON p.id = fa.person_id
                WHERE fa.asset_id = ? AND fa.face_index = ?
            `).get(target.assetId, target.faceIndex) as { person_id: string; name: string } | undefined;
            if (!assignment) {
                throw new Error('Face assignment no longer exists.');
            }
            recordManualFacePersonDecisionByFaceId(db, {
                faceId: target.faceId,
                personId: assignment.person_id,
                personName: assignment.name,
                status: 'accepted',
                sourceRef: 'people.confirm',
            });
            db.prepare(`
                UPDATE face_assignments SET is_suggested = 0
                WHERE asset_id = ? AND face_index = ?
            `).run(target.assetId, target.faceIndex);
            respond(id, 'ok', { message: 'Face assignment confirmed' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    reject_face_assignment: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { personId } = payload as { personId: string };
            const db = dbManager.getDb();
            const target = resolveFaceActionTarget(db, payload as StableFaceActionPayload);
            db.transaction(() => {
                const person = db.prepare('SELECT name FROM people WHERE id = ?')
                    .get(personId) as { name: string } | undefined;
                recordManualFacePersonDecisionByFaceId(db, {
                    faceId: target.faceId,
                    personId,
                    personName: person?.name ?? null,
                    status: 'rejected',
                    sourceRef: 'people.reject',
                });
                db.prepare(`
                    DELETE FROM face_assignments
                    WHERE asset_id = ? AND face_index = ?
                `).run(target.assetId, target.faceIndex);
            })();
            respond(id, 'ok', { message: 'Face assignment rejected' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
