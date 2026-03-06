import { DatabaseManager } from './db';
import { EventBus } from './events/bus';
import { Coordinator } from './coordinator';
import { SystemState } from './state';
import { runScanJob } from './jobs/scan';
import { runFaceDetectionJob } from './jobs/detect_faces';
import { runFaceRecognitionJob } from './jobs/recognise_faces';
import { runFaceClusteringJob } from './jobs/cluster_faces';
import { runSensitiveScanJob } from './jobs/scan_sensitive';
import { runDuplicateGroupingJob } from './jobs/build_duplicate_groups';
import { runComputeHashesJob } from './jobs/compute_hashes';
import { runVariantGroupingJob } from './jobs/build_variant_groups';
import { DomainEvent } from './events/types';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { WebSocket } from 'ws';

export interface CommandContext {
    id: string;
    command: string;
    payload?: unknown;
    originWs?: WebSocket;
    dbManager: DatabaseManager;
    eventBus: EventBus;
    coordinator: Coordinator;
    activeJobs: Map<string, AbortController>;
    LIB_DIR: string;
    respond: (id: string, status: 'ok' | 'error' | 'event', data: unknown, error: string | null, targetWs?: WebSocket) => void;
}

export function handleSystemCommand(ctx: CommandContext): boolean {
    const { id, command, payload, originWs, dbManager, eventBus, coordinator, activeJobs, LIB_DIR, respond } = ctx;
    let result: unknown = null;

    switch (command) {
        case 'ping':
            result = { message: 'pong', timestamp: Date.now() };
            respond(id, 'ok', result, null, originWs);
            return true;
        case 'scan_folder': {
            console.error('[Sidecar] Trace: scan_folder requested');
            const p = payload as { path?: string };
            let scanPath = p.path;
            if (typeof scanPath === 'string') {
                // Strip quotes if present
                scanPath = scanPath.replace(/^["'](.+)["']$/, '$1').trim();
            } else {
                scanPath = '';
            }

            respond(id, 'ok', { message: 'Scan started', jobId: id }, null, originWs);

            // Update folder history
            try {
                dbManager.getDb().prepare(`
                        INSERT OR REPLACE INTO folder_history (path, last_scanned_at) 
                        VALUES (?, ?)
                    `).run(scanPath, new Date().toISOString());
            } catch (_err) {
                console.error('Failed to update folder history:', _err);
            }

            // Trigger FolderScanRequested event
            console.error('[Sidecar] Trace: Emitting FolderScanRequested');
            eventBus.emit({
                type: 'FolderScanRequested',
                folderId: scanPath,
                scanSessionId: id
            });

            const controller = new AbortController();
            activeJobs.set(id, controller);

            // Run the job manually
            console.error('[Sidecar] Trace: calling runScanJob');
            runScanJob(id, scanPath, dbManager, eventBus, controller.signal)
                .then(() => {
                    console.error('[Sidecar] Trace: runScanJob finished');
                    activeJobs.delete(id);
                })
                .catch(_err => {
                    console.error('[Sidecar] Trace: runScanJob FAILED', _err);
                });
            return true;
        }

        case 'generate_previews': {
            respond(id, 'ok', { message: 'Preview generation started' }, null, originWs);
            const allIds = dbManager.getDb().prepare('SELECT id FROM assets').all().map((a: unknown) => (a as { id: string }).id);
            eventBus.emit({ type: 'PreviewRequested', mediaIds: allIds, reason: 'rebuild' });
            return true;
        }

        case 'detect_faces':
            respond(id, 'ok', { message: 'Face detection started' }, null, originWs);
            runFaceDetectionJob('auto', dbManager, eventBus);
            return true;
        case 'recognise_faces':
            respond(id, 'ok', { message: 'Face recognition started' }, null, originWs);
            runFaceRecognitionJob('auto', dbManager, eventBus);
            return true;
        case 'cluster_faces':
            respond(id, 'ok', { message: 'Clustering started' }, null, originWs);
            runFaceClusteringJob(id, dbManager, eventBus);
            return true;

        case 'build_groups': {
            respond(id, 'ok', { message: 'Grouping pipelines started', jobId: id }, null, originWs);
            
            const controller = new AbortController();
            activeJobs.set(id, controller);
            
            eventBus.emit({ type: 'JobStarted', jobId: id, pipelineStage: 'similarity_cluster' } as unknown as DomainEvent);

            (async () => {
                try {
                    // Pass the same job ID to all sub-jobs for unified progress
                    await runDuplicateGroupingJob(id, dbManager, eventBus, controller.signal);
                    if (controller.signal.aborted) return;
                    await runComputeHashesJob(id, dbManager, eventBus, controller.signal);
                    if (controller.signal.aborted) return;
                    await runVariantGroupingJob(id, dbManager, eventBus, controller.signal);
                    
                    eventBus.emit({ type: 'JobCompleted', jobId: id, pipelineStage: 'similarity_cluster' } as unknown as DomainEvent);
                } catch (e) {
                    console.error("Grouping Pipeline failed", e);
                    eventBus.emit({ type: 'JobFailed', jobId: id, error: String(e) } as unknown as DomainEvent);
                } finally {
                    activeJobs.delete(id);
                }
            })();
            return true;
        }

        case 'prioritize_asset_processing': {
            respond(id, 'ok', { message: 'Priority boosted' }, null, originWs);
            try {
                const p = payload as { mediaId: string };
                dbManager.getDb().prepare(`UPDATE task_queue SET priority = 100 WHERE media_id = ? AND status = 'pending'`).run(p.mediaId);
                // trigger coordinator evaluation trick
                eventBus.emit({ type: 'JobCompleted', jobId: 'priority-boost', pipelineStage: 'system' });
            } catch (_err) {
                console.error('Failed to boost priority', _err);
            }
            return true;
        }

        case 'pause_jobs':
            SystemState.isPaused = true;
            respond(id, 'ok', { message: 'System paused' }, null, originWs);
            // Broadcast state change to all clients
            eventBus.emit({ type: 'SystemPausedStateChanged', isPaused: true } as unknown as DomainEvent);
            return true;

        case 'resume_jobs':
            SystemState.isPaused = false;
            respond(id, 'ok', { message: 'System resumed' }, null, originWs);
            eventBus.emit({ type: 'SystemPausedStateChanged', isPaused: false } as unknown as DomainEvent);
            // Kick start any pending work
            coordinator.forceEvaluate();
            return true;

        case 'get_pause_state':
            respond(id, 'ok', { isPaused: SystemState.isPaused }, null, originWs);
            return true;

        case 'rename_person': {
            try {
                const db = dbManager.getDb();
                const { newName, personId } = payload as { newName: string, personId: string };
                db.transaction(() => {
                    db.prepare(`
                            INSERT OR REPLACE INTO manual_face_names (original_path, face_index, name)
                            SELECT a.original_path, fa.face_index, ? 
                            FROM face_assignments fa 
                            JOIN assets a ON a.id = fa.asset_id 
                            WHERE fa.person_id = ?
                        `).run(newName, personId);

                    db.prepare("UPDATE people SET name = ? WHERE id = ?").run(newName, personId);
                })();
                respond(id, 'ok', { message: 'Person renamed' }, null, originWs);
                eventBus.emit({ type: 'JobCompleted', jobId: 'rename', pipelineStage: 'analysis' }); // Trigger refresh
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'merge_people': {
            try {
                const db = dbManager.getDb();
                const { personIds, targetName } = payload as { personIds: string[], targetName: string };
                if (!personIds || personIds.length < 2) throw new Error("Need at least 2 people to merge");

                db.transaction(() => {
                    const canonicalId = personIds[0];

                    // 1. Save intent
                    for (const pid of personIds) {
                        db.prepare(`
                                INSERT OR REPLACE INTO manual_face_names (original_path, face_index, name)
                                SELECT a.original_path, fa.face_index, ? 
                                FROM face_assignments fa 
                                JOIN assets a ON a.id = fa.asset_id 
                                WHERE fa.person_id = ?
                            `).run(targetName, pid);
                    }

                    // 2. Execute live patch
                    db.prepare("UPDATE people SET name = ? WHERE id = ?").run(targetName, canonicalId);
                    for (let i = 1; i < personIds.length; i++) {
                        db.prepare("UPDATE face_assignments SET person_id = ? WHERE person_id = ?").run(canonicalId, personIds[i]);
                        db.prepare("DELETE FROM people WHERE id = ?").run(personIds[i]);
                    }
                })();
                respond(id, 'ok', { message: 'People merged' }, null, originWs);
                eventBus.emit({ type: 'JobCompleted', jobId: 'merge', pipelineStage: 'analysis' }); // Trigger refresh
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'get_setting': {
            try {
                const p = payload as { key: string };
                const val = dbManager.getSetting(p.key);
                respond(id, 'ok', { value: val }, null, originWs);
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'set_setting': {
            try {
                const p = payload as { key: string, value: string };
                dbManager.setSetting(p.key, p.value);
                respond(id, 'ok', { message: 'Setting saved' }, null, originWs);
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'extract_ai_metadata': {
            respond(id, 'ok', { message: 'AI Metadata extraction started' }, null, originWs);
            // Payload might explicitly contain a mediaId for targeted updates
            const p = payload as { mediaId?: string };
            eventBus.emit({ type: 'AiMetadataRequested', mediaIds: p.mediaId ? [p.mediaId] : [], jobId: id } as unknown as DomainEvent);
            return true;
        }

        case 'isolate_face': {
            try {
                const db = dbManager.getDb();
                const { assetId, faceIndex } = payload as { assetId: string, faceIndex: number };
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
                    db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)").run(newPersonId, "Unknown Person", null);
                    db.prepare("UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?").run(newPersonId, assetId, faceIndex);
                })();
                respond(id, 'ok', { message: 'Face isolated' }, null, originWs);
                eventBus.emit({ type: 'JobCompleted', jobId: 'isolate', pipelineStage: 'analysis' }); // Trigger refresh
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'isolate_person_asset': {
            try {
                const db = dbManager.getDb();
                const { assetId, personId } = payload as { assetId: string, personId: string };
                db.transaction(() => {
                    const faces = db.prepare("SELECT face_index FROM face_assignments WHERE asset_id = ? AND person_id = ?").all(assetId, personId) as { face_index: number }[];
                    for (const f of faces) {
                        db.prepare(`
                                INSERT OR REPLACE INTO manual_face_isolations (original_path, face_index, from_person_id)
                                SELECT original_path, ?, ? FROM assets WHERE id = ?
                            `).run(f.face_index, personId, assetId);

                        db.prepare(`
                                DELETE FROM manual_face_names
                                WHERE original_path = (SELECT original_path FROM assets WHERE id = ?) AND face_index = ?
                            `).run(assetId, f.face_index);

                        const newPersonId = uuidv4();
                        db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)").run(newPersonId, "Unknown Person", null);
                        db.prepare("UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?").run(newPersonId, assetId, f.face_index);
                    }
                })();
                respond(id, 'ok', { message: 'Photos untagged' }, null, originWs);
                eventBus.emit({ type: 'JobCompleted', jobId: 'untag_asset', pipelineStage: 'analysis' }); // Trigger refresh
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'get_people': {
            try {
                console.error('[Sidecar] Handling get_people');
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
                    `).all() as { id: string, name: string, face_count: number, rejected_count: number, cover_image: string | null }[];
                console.error(`[Sidecar] Found ${people.length} people`);
                respond(id, 'ok', { people }, null, originWs);
            } catch (_err) {
                respond(id, 'error', null, _err instanceof Error ? _err.message : String(_err), originWs);
            }
            return true;
        }

        case 'get_assets': {
            try {
                console.error('[Sidecar] Handling get_assets');
                // Support pagination, grouping, and filtering
                const p = payload as { offset?: number, limit?: number, withGroupCounts?: boolean, filter?: { personIds?: string[], type?: string, albumId?: string } };
                const offset = p.offset || 0;
                const limit = p.limit || 500;
                const withGroupCounts = p.withGroupCounts ?? true;
                const filter = p.filter;
                const personIds: string[] = filter?.personIds || [];
                const albumId: string | undefined = filter?.albumId;

                let filterSubquery = '';
                const params: (string | number)[] = [];

                if (filter && filter.type === 'album' && albumId) {
                    filterSubquery = `
                            AND a.id IN (
                                SELECT asset_id FROM album_items WHERE album_id = ?
                            )
                        `;
                    params.push(albumId);
                } else if (filter && personIds.length > 0) {
                    const placeholders = personIds.map(() => '?').join(',');
                    if (filter.type === 'person_any') {
                        filterSubquery = `
                                AND a.id IN (
                                    SELECT asset_id FROM face_assignments WHERE person_id IN (${placeholders})
                                )
                            `;
                        params.push(...personIds);
                    } else if (filter.type === 'person_all') {
                        filterSubquery = `
                                AND a.id IN (
                                    SELECT asset_id FROM face_assignments 
                                    WHERE person_id IN (${placeholders})
                                    GROUP BY asset_id
                                    HAVING COUNT(DISTINCT person_id) = ${personIds.length}
                                )
                            `;
                        params.push(...personIds);
                    } else if (filter.type === 'person_only') {
                        filterSubquery = `
                                AND a.id IN (
                                    SELECT asset_id FROM face_assignments 
                                    GROUP BY asset_id
                                    HAVING COUNT(DISTINCT CASE WHEN person_id IN (${placeholders}) THEN person_id END) = ${personIds.length}
                                    AND COUNT(DISTINCT CASE WHEN person_id NOT IN (${placeholders}) THEN person_id END) = 0
                                )
                            `;
                        params.push(...personIds, ...personIds);
                    }
                }

                let sql = '';
                if (filterSubquery !== '') {
                    // Filters bypass the "canonical grouping stack" since we want to find the exact asset matching the filter
                    sql = `
                      SELECT a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                        a.caption, a.sensitivity_score,
                        am.sensitivity_status,
                        p.path as preview_path,
                        dr.data as faces_data, fr.data as rec_data, aim.data as ai_metadata_data,
                        (
                            SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', per.id, 'name', per.name))
                            FROM face_assignments fa
                            JOIN people per ON fa.person_id = per.id
                            WHERE fa.asset_id = a.id
                        ) as people_data,
                        null as member_group_id, null as member_role, null as stack_count
                      FROM assets a
                      LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                      LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'face_landmarks'
                      LEFT JOIN derived_results fr ON a.id = fr.asset_id AND fr.task = 'face_recognition'
                      LEFT JOIN derived_results aim ON a.id = aim.asset_id AND aim.task = 'photo_metadata'
                      LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
                      LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
                      WHERE 1=1 ${filterSubquery}
                      ORDER BY a.created_at ASC
                      LIMIT ? OFFSET ?
                    `;
                    params.push(limit, offset);
                } else if (withGroupCounts) {
                    sql = `
                        WITH GroupCounts AS (
                            SELECT group_id, COUNT(asset_id) as stack_count
                            FROM asset_group_members
                            GROUP BY group_id
                        )
                        SELECT 
                            a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                            a.caption, a.sensitivity_score,
                            null as sensitivity_status, -- Not available in this join path
                            p.path as preview_path,
                            m.group_id as member_group_id,
                            m.role as member_role,
                            gc.stack_count,
                            r_faces.data as faces_data,
                            r_rec.data as rec_data,
                            r_ai.data as ai_metadata_data,
                            json_group_array(json_object('face_index', fa.face_index, 'person_id', ppl.id, 'name', ppl.name)) as people_data
                        FROM assets a
                        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                        LEFT JOIN derived_results r_faces ON a.id = r_faces.asset_id AND r_faces.task = 'face_landmarks'
                        LEFT JOIN derived_results r_rec ON a.id = r_rec.asset_id AND r_rec.task = 'face_recognition'
                        LEFT JOIN derived_results r_ai ON a.id = r_ai.asset_id AND r_ai.task = 'photo_metadata'
                        LEFT JOIN face_assignments fa ON a.id = fa.asset_id
                        LEFT JOIN people ppl ON fa.person_id = ppl.id
                        
                        -- Join membership to see if it's in a group
                        LEFT JOIN asset_group_members m ON a.id = m.asset_id
                        LEFT JOIN GroupCounts gc ON m.group_id = gc.group_id
                        
                        WHERE 
                            -- Only show if it's NOT in a group OR it IS the canonical member of its group
                            (m.group_id IS NULL OR m.role = 'canonical')
                        
                        GROUP BY a.id, p.path, r_faces.data, r_rec.data, r_ai.data, m.group_id, m.role, gc.stack_count
                        ORDER BY a.created_at DESC
                        LIMIT ? OFFSET ?
                    `;
                    params.push(limit, offset);
                } else {
                    sql = `
                        SELECT 
                            a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                            a.caption, a.sensitivity_score,
                            null as sensitivity_status, -- Not available in this join path
                            p.path as preview_path,
                            r_faces.data as faces_data,
                            r_rec.data as rec_data,
                            r_ai.data as ai_metadata_data,
                            json_group_array(json_object('face_index', fa.face_index, 'person_id', ppl.id, 'name', ppl.name)) as people_data,
                            null as member_group_id, null as member_role, null as stack_count
                        FROM assets a
                        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                        LEFT JOIN derived_results r_faces ON a.id = r_faces.asset_id AND r_faces.task = 'face_landmarks'
                        LEFT JOIN derived_results r_rec ON a.id = r_rec.asset_id AND r_rec.task = 'face_recognition'
                        LEFT JOIN derived_results r_ai ON a.id = r_ai.asset_id AND r_ai.task = 'photo_metadata'
                        LEFT JOIN face_assignments fa ON a.id = fa.asset_id
                        LEFT JOIN people ppl ON fa.person_id = ppl.id
                        GROUP BY a.id, p.path, r_faces.data, r_rec.data, r_ai.data
                        ORDER BY a.created_at DESC
                        LIMIT ? OFFSET ?
                    `;
                    params.push(limit, offset);
                }

                const rows = dbManager.getDb().prepare(sql).all(...params) as {
                    id: string, original_path: string, width: number, height: number, file_size: number, created_at: string,
                    preview_path: string | null, faces_data: string | null, rec_data: string | null, ai_metadata_data: string | null,
                    people_data: string | null, caption: string | null, sensitivity_score: number | null, sensitivity_status: string | null,
                    member_group_id?: string | null, member_role?: string | null, stack_count?: number | null
                }[];

                const assets = rows.map(row => {
                    const faces = row.faces_data ? JSON.parse(row.faces_data).faces : [];
                    // Need to filter out empty objects created by json_group_array when no people exist
                    let peopleData: { face_index: number, person_id: string, name: string }[] = [];
                    if (row.people_data) {
                        try {
                            const parsed = JSON.parse(row.people_data);
                            peopleData = parsed.filter((p: { person_id: string | null }) => p.person_id !== null);
                        } catch {
                            // ignore
                        }
                    }

                    // Merge names into faces
                    faces.forEach((f: { person_id?: string, person_name?: string }, idx: number) => {
                        const assignment = peopleData.find((p) => p.face_index === idx);
                        if (assignment) {
                            f.person_id = assignment.person_id;
                            f.person_name = assignment.name;
                        }
                    });

                    const aiMeta = row.ai_metadata_data ? JSON.parse(row.ai_metadata_data) : undefined;
                    return {
                        id: row.id,
                        original_path: row.original_path,
                        width: row.width,
                        height: row.height,
                        file_size: row.file_size,
                        created_at: row.created_at,
                        preview_path: row.preview_path,
                        faces,
                        face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : [],
                        ai_metadata: aiMeta,
                        caption: row.caption || aiMeta?.caption || undefined,
                        sensitivity_score: row.sensitivity_score,
                        sensitivity_status: row.sensitivity_status,
                        group_id: row.member_group_id,
                        group_role: row.member_role,
                        stack_count: row.stack_count,
                    };
                });

                console.error(`[Sidecar] Found ${assets.length} assets`);
                respond(id, 'ok', { assets }, null, originWs);
            } catch (e: unknown) {
                console.error('[Sidecar] get_assets failed:', e);
                respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
            }
            return true;
        }

        case 'get_group_orbit': {
        try {
            const p = payload as { groupId: string };
            const sql = `
                    SELECT 
                        m.role, m.rank, m.evidence_json as match_evidence,
                        a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                        p.path as preview_path
                    FROM asset_group_members m
                    JOIN assets a ON a.id = m.asset_id
                    LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                    WHERE m.group_id = ?
                    ORDER BY 
                        CASE WHEN m.role='canonical' THEN 0 ELSE 1 END,
                        COALESCE(m.rank, 999999)
                `;
            const orbitAssets = dbManager.getDb().prepare(sql).all(p.groupId);
            respond(id, 'ok', { orbit: orbitAssets }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'explode_group': {
        try {
            const p = payload as { groupId: string };
            dbManager.getDb().transaction(() => {
                dbManager.getDb().prepare("UPDATE asset_groups SET status = 'rejected' WHERE id = ?").run(p.groupId);
                dbManager.getDb().prepare("DELETE FROM asset_group_members WHERE group_id = ?").run(p.groupId);
            })();
            respond(id, 'ok', { message: 'Group exploded' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'set_canonical': {
        try {
            const p = payload as { groupId: string, assetId: string };
            // Also implicitly lock the group so the system respects my manual choice.
            dbManager.getDb().transaction(() => {
                dbManager.getDb().prepare("UPDATE asset_groups SET canonical_asset_id = ?, status = 'locked' WHERE id = ?").run(p.assetId, p.groupId);
                dbManager.getDb().prepare("UPDATE asset_group_members SET role = 'member' WHERE group_id = ? AND role = 'canonical'").run(p.groupId);
                dbManager.getDb().prepare("UPDATE asset_group_members SET role = 'canonical', rank = -1 WHERE group_id = ? AND asset_id = ?").run(p.groupId, p.assetId);
            })();
            respond(id, 'ok', { message: 'Canonical updated and group locked' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        // --- ALBUMS API ---

        case 'create_album': {
        try {
            const p = payload as { title: string, description?: string, rules_json?: string };
            const albumId = uuidv4();
            dbManager.getDb().prepare("INSERT INTO albums (id, title, description, rules_json) VALUES (?, ?, ?, ?)").run(
                albumId, p.title, p.description || null, p.rules_json || null
            );
            respond(id, 'ok', { message: 'Album created', albumId }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

    case 'build_bursts': {
        respond(id, 'ok', { message: 'Burst grouping started' }, null, originWs);
        eventBus.emit({ type: 'BurstGroupingRequested', jobId: id } as unknown as DomainEvent);
        return true;
    }

        case 'update_album': {
        try {
            const p = payload as { albumId: string, title?: string, description?: string, coverAssetId?: string };
            const updates = [];
            const params: string[] = [];
            if (p.title !== undefined) { updates.push("title = ?"); params.push(p.title); }
            if (p.description !== undefined) { updates.push("description = ?"); params.push(p.description); }
            if (p.coverAssetId !== undefined) { updates.push("cover_asset_id = ?"); params.push(p.coverAssetId); }

            if (updates.length > 0) {
                params.push(p.albumId);
                dbManager.getDb().prepare(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            }
            respond(id, 'ok', { message: 'Album updated' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'delete_album': {
        try {
            const p = payload as { albumId: string };
            dbManager.getDb().prepare("DELETE FROM albums WHERE id = ?").run(p.albumId);
            respond(id, 'ok', { message: 'Album deleted' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'add_to_album': {
        try {
            const p = payload as { albumId: string, assetIds: string[] };
            const insert = dbManager.getDb().prepare("INSERT OR IGNORE INTO album_items (album_id, asset_id) VALUES (?, ?)");
            dbManager.getDb().transaction(() => {
                for (const assetId of p.assetIds) {
                    insert.run(p.albumId, assetId);
                }
            })();
            respond(id, 'ok', { message: 'Assets added to album' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'remove_from_album': {
        try {
            const p = payload as { albumId: string, assetIds: string[] };
            const remove = dbManager.getDb().prepare("DELETE FROM album_items WHERE album_id = ? AND asset_id = ?");
            dbManager.getDb().transaction(() => {
                for (const assetId of p.assetIds) {
                    remove.run(p.albumId, assetId);
                }
            })();
            respond(id, 'ok', { message: 'Assets removed from album' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'get_albums': {
        try {
            const sql = `
                SELECT 
                    al.id, al.title, al.description, al.rules_json, al.created_at,
                    (SELECT COUNT(*) FROM album_items WHERE album_id = al.id) as item_count,
                    (
                        SELECT p.path 
                        FROM previews p 
                        WHERE p.asset_id = COALESCE(
                            al.cover_asset_id, 
                            (SELECT asset_id FROM album_items WHERE album_id = al.id ORDER BY added_at DESC LIMIT 1)
                        ) 
                        AND p.size = 'thumbnail' 
                        LIMIT 1
                    ) as cover_preview_path
                FROM albums al
                ORDER BY al.title ASC
            `;
            const albums = dbManager.getDb().prepare(sql).all();
            respond(id, 'ok', { albums }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'get_album_items': {
        try {
            const p = payload as { albumId: string };
            const sql = `
                    SELECT 
                        a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                        p.path as preview_path, i.added_at
                    FROM album_items i
                    JOIN assets a ON a.id = i.asset_id
                    LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                    WHERE i.album_id = ?
                    ORDER BY i.added_at DESC
                `;
            const items = dbManager.getDb().prepare(sql).all(p.albumId);
            respond(id, 'ok', { items }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }


    case 'get_stats': {
        try {
            const db = dbManager.getDb();
            const count = db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number };
            const history = db.prepare('SELECT path, last_scanned_at FROM folder_history ORDER BY last_scanned_at DESC LIMIT 5').all();
            respond(id, 'ok', { count: count?.count || 0, folderHistory: history }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'stop_job':
        case 'abort_job': {
            const p = payload as { jobId: string };
            const jobIdToAbort = p.jobId;
            
            if (jobIdToAbort?.startsWith('class-')) {
                // Abort all active jobs belonging to this system class
                const classMap: Record<string, string> = {
                    'class-onboarding': 'scan-',
                    'class-previews': 'previews-',
                    'class-detection': 'detect-',
                    'class-mapping': 'recog-',
                    'class-clustering': 'cluster-',
                    'class-aimetadata': 'ai_meta-',
                    'class-sensitive': 'sensitive-'
                };
                const prefix = classMap[jobIdToAbort];
                if (prefix) {
                    let count = 0;
                    for (const [id, controller] of activeJobs.entries()) {
                        if (id.startsWith(prefix)) {
                            controller.abort();
                            activeJobs.delete(id);
                            count++;
                        }
                    }
                    respond(id, 'ok', { message: `Aborted ${count} sub-jobs for ${jobIdToAbort}` }, null, originWs);
                    return true;
                }
            }

            if (jobIdToAbort && activeJobs.has(jobIdToAbort)) {
                console.error(`[Sidecar] Aborting specific job: ${jobIdToAbort}`);
                activeJobs.get(jobIdToAbort)?.abort();
                activeJobs.delete(jobIdToAbort);
                respond(id, 'ok', { message: 'Stop signal sent' }, null, originWs);
            } else {
                respond(id, 'error', null, `Job not found or not active: ${jobIdToAbort}`, originWs);
            }
            return true;
        }

        case 'clear_job_errors': {
            try {
                const { task } = payload as { task: string };
                const db = dbManager.getDb();
                
                // Map of stages/classes to task names in processing_issues
                const taskMap: Record<string, string[]> = {
                    'onboarding': ['scan', 'ingest'],
                    'previews': ['preview'],
                    'analysis': ['detection', 'recognition', 'clustering', 'ai_metadata'],
                    'safety': ['sensitive_scan'],
                    'ai_metadata': ['ai_metadata'],
                    // Handle class IDs if sent
                    'class-onboarding': ['scan', 'ingest'],
                    'class-previews': ['preview'],
                    'class-detection': ['detection'],
                    'class-mapping': ['recognition'],
                    'class-clustering': ['clustering'],
                    'class-aimetadata': ['ai_metadata'],
                    'class-sensitive': ['sensitive_scan']
                };

                const tasksToClear = taskMap[task] || [task];
                const placeholders = tasksToClear.map(() => '?').join(',');
                
                const stmt = db.prepare(`DELETE FROM processing_issues WHERE task IN (${placeholders})`);
                const result = stmt.run(...tasksToClear);
                
                respond(id, 'ok', { message: `Cleared ${result.changes} errors for ${task}` }, null, originWs);
            } catch (err) {
                respond(id, 'error', null, String(err), originWs);
            }
            return true;
        }

        case 'get_system_jobs': {
            try {
                const db = dbManager.getDb();
                
                // 1. Basic Counts
                const totalAssets = (db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number }).count;
                const doneScored = (db.prepare("SELECT COUNT(*) as count FROM assets WHERE sensitivity_score IS NOT NULL").get() as { count: number }).count;
                const donePreviews = (db.prepare("SELECT COUNT(DISTINCT asset_id) as count FROM previews WHERE size = 'thumbnail'").get() as { count: number }).count;

                // 2. Incoming Scans (Sum of running scan jobs)
                const incomingCount = db.prepare(`SELECT COALESCE(SUM(total_items), 0) as incoming FROM jobs WHERE status = 'running' AND id LIKE 'scan-%'`).get() as { incoming: number };
                const totalExpected = totalAssets + incomingCount.incoming;

                // 3. Derived Results Aggregation
                const derivedCountsRows = db.prepare("SELECT task, COUNT(DISTINCT asset_id) as count FROM derived_results GROUP BY task").all() as { task: string, count: number }[];
                const derivedCounts = Object.fromEntries(derivedCountsRows.map(r => [r.task, r.count]));
                const doneDetection = derivedCounts['face_detection'] || 0;
                const doneRecognition = derivedCounts['face_recognition'] || 0;
                const doneAiMetadata = derivedCounts['ai_metadata'] || 0;

                // 4. Processing Issues Aggregation
                const issueCountsRows = db.prepare("SELECT task, COUNT(*) as count FROM processing_issues GROUP BY task").all() as { task: string, count: number }[];
                const issueCounts = Object.fromEntries(issueCountsRows.map(r => [r.task, r.count]));

                // 5. Recent Issues (Top 5 per task via Window Function)
                const allRecentIssuesRows = db.prepare(`
                    SELECT id, message, severity, created_at, task
                    FROM (
                        SELECT id, message, severity, created_at, task,
                               ROW_NUMBER() OVER(PARTITION BY task ORDER BY created_at DESC) as rn
                        FROM processing_issues
                    )
                    WHERE rn <= 5
                `).all() as { task: string, id: string, message: string, severity: string, created_at: string }[];
                
                const issuesByTask: Record<string, any[]> = {};
                for (const row of allRecentIssuesRows) {
                    if (!issuesByTask[row.task]) issuesByTask[row.task] = [];
                    issuesByTask[row.task].push({ id: row.id, message: row.message, severity: row.severity, created_at: row.created_at });
                }

                // 6. Job Stats Aggregation
                const jobStatsRows = db.prepare(`
                    SELECT 
                        CASE 
                            WHEN id LIKE 'scan-%' THEN 'scan'
                            WHEN id LIKE 'previews-%' THEN 'previews'
                            WHEN id LIKE 'detect-%' THEN 'detect'
                            WHEN id LIKE 'recog-%' THEN 'recog'
                            WHEN id LIKE 'cluster-%' THEN 'cluster'
                            WHEN id LIKE 'sensitive-%' THEN 'sensitive'
                            WHEN id LIKE 'ai_meta-%' THEN 'ai_meta'
                            ELSE 'other'
                        END as kind,
                        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as active_count,
                        AVG(CASE WHEN status = 'completed' AND finished_at IS NOT NULL THEN strftime('%s', finished_at) - strftime('%s', started_at) ELSE NULL END) as avg_sec
                    FROM jobs
                    GROUP BY kind
                `).all() as { kind: string, active_count: number, avg_sec: number | null }[];
                const jobStats = Object.fromEntries(jobStatsRows.map(r => [r.kind, { activeCount: r.active_count, avgSec: r.avg_sec || 0 }]));

                const activeJobsRows = db.prepare(`
                    SELECT current_item_path, throughput_ips, 
                        CASE 
                            WHEN id LIKE 'scan-%' THEN 'scan'
                            WHEN id LIKE 'previews-%' THEN 'previews'
                            WHEN id LIKE 'detect-%' THEN 'detect'
                            WHEN id LIKE 'recog-%' THEN 'recog'
                            WHEN id LIKE 'cluster-%' THEN 'cluster'
                            WHEN id LIKE 'sensitive-%' THEN 'sensitive'
                            WHEN id LIKE 'ai_meta-%' THEN 'ai_meta'
                            ELSE 'other'
                        END as kind
                    FROM jobs
                    WHERE status = 'running'
                    ORDER BY started_at DESC
                `).all() as { current_item_path: string, throughput_ips: number, kind: string }[];
                const activeJobDetails: Record<string, { current: string, throughput: number }> = {};
                for (const row of activeJobsRows) {
                    if (!activeJobDetails[row.kind]) {
                        activeJobDetails[row.kind] = { current: row.current_item_path, throughput: row.throughput_ips };
                    }
                }

                const getClassStatsFast = (kind: string) => {
                    const stats = jobStats[kind] || { activeCount: 0, avgSec: 0 };
                    const details = activeJobDetails[kind];
                    return {
                        activeCount: stats.activeCount,
                        avgSec: stats.avgSec,
                        current: details?.current,
                        throughput: details?.throughput
                    };
                };

                const scanStats = getClassStatsFast('scan');
                const previewStats = getClassStatsFast('previews');
                const detectStats = getClassStatsFast('detect');
                const recogStats = getClassStatsFast('recog');
                const clusterStats = getClassStatsFast('cluster');
                const aiMetaStats = getClassStatsFast('ai_meta');
                const sensitiveStats = getClassStatsFast('sensitive');

                const systemJobs = [
                    {
                        id: 'class-onboarding',
                        stage: 'onboarding',
                        title: 'Photo Onboarding',
                        state: scanStats.activeCount > 0 ? 'running' : 'idle',
                        activeCount: scanStats.activeCount,
                        avgDurationSec: scanStats.avgSec,
                        progress: {
                            overallTotal: incomingCount.incoming || totalAssets,
                            overallDone: totalAssets,
                            overallPercent: (incomingCount.incoming || 0) > 0 ? (totalAssets / (incomingCount.incoming || 1)) * 100 : 100,
                            errors: (issueCounts['scan'] || 0) + (issueCounts['ingest'] || 0),
                            current: scanStats.current,
                            throughputIps: scanStats.throughput
                        },
                        issues: [...(issuesByTask['scan'] || []), ...(issuesByTask['ingest'] || [])].slice(0, 5)
                    },
                    {
                        id: 'class-previews',
                        stage: 'previews',
                        title: 'Thumbnail Generation',
                        state: previewStats.activeCount > 0 ? 'running' : (donePreviews < totalAssets ? 'paused' : 'completed'),
                        activeCount: previewStats.activeCount,
                        avgDurationSec: previewStats.avgSec,
                        progress: {
                            overallTotal: totalExpected,
                            overallDone: donePreviews,
                            overallPercent: totalExpected > 0 ? (donePreviews / totalExpected) * 100 : 100,
                            errors: issueCounts['preview'] || 0,
                            current: previewStats.current,
                            throughputIps: previewStats.throughput
                        },
                        issues: issuesByTask['preview'] || []
                    },
                    {
                        id: 'class-detection',
                        stage: 'analysis',
                        title: 'Face Detection',
                        state: detectStats.activeCount > 0 ? 'running' : (doneDetection < totalAssets ? 'paused' : 'completed'),
                        activeCount: detectStats.activeCount,
                        avgDurationSec: detectStats.avgSec,
                        progress: {
                            overallTotal: totalExpected,
                            overallDone: doneDetection,
                            overallPercent: totalExpected > 0 ? (doneDetection / totalExpected) * 100 : 100,
                            errors: issueCounts['detection'] || 0,
                            current: detectStats.current,
                            throughputIps: detectStats.throughput
                        },
                        issues: issuesByTask['detection'] || []
                    },
                    {
                        id: 'class-mapping',
                        stage: 'analysis',
                        title: 'Face Recognition',
                        state: recogStats.activeCount > 0 ? 'running' : (doneRecognition < doneDetection ? 'paused' : 'completed'),
                        activeCount: recogStats.activeCount,
                        avgDurationSec: recogStats.avgSec,
                        progress: {
                            overallTotal: totalExpected,
                            overallDone: doneRecognition,
                            overallPercent: totalExpected > 0 ? (doneRecognition / totalExpected) * 100 : 100,
                            errors: issueCounts['recognition'] || 0,
                            current: recogStats.current,
                            throughputIps: recogStats.throughput
                        },
                        issues: issuesByTask['recognition'] || []
                    },
                    {
                        id: 'class-clustering',
                        stage: 'analysis',
                        title: 'Face Clustering',
                        state: clusterStats.activeCount > 0 ? 'running' : 'idle',
                        activeCount: clusterStats.activeCount,
                        avgDurationSec: clusterStats.avgSec,
                        progress: {
                            overallTotal: doneRecognition,
                            overallDone: 0,
                            overallPercent: 100,
                            errors: issueCounts['clustering'] || 0,
                            current: clusterStats.current,
                            throughputIps: clusterStats.throughput
                        },
                        issues: issuesByTask['clustering'] || []
                    },
                    {
                        id: 'class-sensitive',
                        stage: 'safety',
                        title: 'Sensitive Content Scan',
                        state: sensitiveStats.activeCount > 0 ? 'running' : (doneScored < totalAssets ? 'paused' : 'completed'),
                        activeCount: sensitiveStats.activeCount,
                        avgDurationSec: sensitiveStats.avgSec,
                        progress: {
                            overallTotal: totalExpected,
                            overallDone: doneScored,
                            overallPercent: totalExpected > 0 ? (doneScored / totalExpected) * 100 : 100,
                            errors: issueCounts['sensitive_scan'] || 0,
                            current: sensitiveStats.current,
                            throughputIps: sensitiveStats.throughput
                        },
                        issues: issuesByTask['sensitive_scan'] || []
                    },
                    {
                        id: 'class-aimetadata',
                        stage: 'analysis',
                        title: 'Extract AI Metadata',
                        state: aiMetaStats.activeCount > 0 ? 'running' : 'idle',
                        activeCount: aiMetaStats.activeCount,
                        avgDurationSec: aiMetaStats.avgSec,
                        progress: {
                            overallTotal: totalExpected,
                            overallDone: doneAiMetadata,
                            overallPercent: totalExpected > 0 ? (doneAiMetadata / totalExpected) * 100 : 100,
                            errors: issueCounts['ai_metadata'] || 0,
                            current: aiMetaStats.current,
                            throughputIps: aiMetaStats.throughput
                        },
                        issues: issuesByTask['ai_metadata'] || []
                    }
                ];

                respond(id, 'ok', { jobs: systemJobs }, null, originWs);
            } catch (e: unknown) {
                respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
            }
            return true;
        }

        case 'reset_library': {
        try {
            console.log(`Resetting library.Cancelling ${activeJobs.size} active jobs.`);
            for (const [jobId, controller] of activeJobs.entries()) {
                controller.abort();
                activeJobs.delete(jobId);
            }
            const db = dbManager.getDb();
            db.prepare('DELETE FROM events').run();
            db.prepare('DELETE FROM derived_results').run();
            db.prepare('DELETE FROM face_assignments').run();
            db.prepare('DELETE FROM people').run();
            db.prepare('DELETE FROM task_queue').run();
            db.prepare('DELETE FROM previews').run();
            db.prepare('DELETE FROM jobs').run();
            db.prepare('DELETE FROM processing_issues').run();

            db.prepare('DELETE FROM asset_group_members').run();
            db.prepare('DELETE FROM asset_groups').run();
            db.prepare('DELETE FROM asset_similarity_edges').run();
            db.prepare('DELETE FROM asset_features').run();
            db.prepare('DELETE FROM album_items').run();
            db.prepare('DELETE FROM albums').run();

            db.prepare('DELETE FROM assets').run();
            // NOTE: asset_identities and assets_manual are NOT deleted — they survive factory reset

            const previewsDir = join(LIB_DIR, 'previews');
            if (existsSync(previewsDir)) {
                try {
                    rmSync(previewsDir, { recursive: true, force: true });
                } catch {
                    // Ignored
                }
            }
            respond(id, 'ok', { message: 'Library reset complete' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'scan_sensitive':
    respond(id, 'ok', { message: 'Sensitive content scan started' }, null, originWs);
    runSensitiveScanJob('auto', dbManager, eventBus).catch(console.error);
    return true;

        case 'scan_sensitive_force':
    // Re-scan ALL assets, clearing existing scores first
    respond(id, 'ok', { message: 'Force re-scan of all assets started' }, null, originWs);
    runSensitiveScanJob('auto', dbManager, eventBus, true).catch(console.error);
    return true;

        case 'get_sensitivity': {
        // Returns sensitivity data for a specific asset
        try {
            const db = dbManager.getDb();
            const { assetId } = payload as { assetId: string };
            const row = db.prepare(`
                        SELECT a.sensitivity_score, am.sensitivity_status
                        FROM assets a
                        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
                        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
                        WHERE a.id = ?
                    `).get(assetId) as { sensitivity_score: number | null, sensitivity_status: string | null } | undefined;
            respond(id, 'ok', row || { sensitivity_score: null, sensitivity_status: null }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'set_sensitivity': {
        // Set manual sensitivity override for an asset. status: 'safe' | 'review' | 'unsafe' | null (to clear)
        try {
            const db = dbManager.getDb();
            const { assetId, status: sensitivityStatus } = payload as { assetId: string, status: string | null };

            db.transaction(() => {
                // Ensure identity row exists
                const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as { original_path: string } | undefined;
                if (!asset) throw new Error(`Asset ${assetId} not found`);

                // Upsert identity
                let identity = db.prepare('SELECT guid FROM asset_identities WHERE original_path = ?').get(asset.original_path) as { guid: string } | undefined;
                if (!identity) {
                    const guid = uuidv4();
                    db.prepare('INSERT INTO asset_identities (guid, original_path) VALUES (?, ?)').run(guid, asset.original_path);
                    identity = { guid };
                }

                if (sensitivityStatus === null) {
                    // Clear override
                    db.prepare('DELETE FROM assets_manual WHERE identity_guid = ?').run(identity.guid);
                } else {
                    // Upsert override
                    db.prepare(`
                                INSERT INTO assets_manual (identity_guid, sensitivity_status, updated_at)
                                VALUES (?, ?, ?)
                                ON CONFLICT(identity_guid) DO UPDATE SET
                                    sensitivity_status = excluded.sensitivity_status,
                                    updated_at = excluded.updated_at
                            `).run(identity.guid, sensitivityStatus, new Date().toISOString());
                }
            })();

            respond(id, 'ok', { message: 'Sensitivity override saved' }, null, originWs);
            // Trigger a library refresh so UI picks up new status
            eventBus.emit({ type: 'JobCompleted', jobId: 'set-sensitivity', pipelineStage: 'manual' });
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'reset_faces': {
        try {
            dbManager.getDb().prepare("DELETE FROM derived_results WHERE task = 'face_detection'").run();
            respond(id, 'ok', { message: 'Face detection results cleared' }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        case 'get_rejected_assets_for_person': {
        try {
            const db = dbManager.getDb();
            const { personId: rejPersonId } = payload as { personId: string };
            const rejectedRows = db.prepare(`
                        SELECT a.id, a.original_path, a.width, a.height,
                               p.path as preview_path
                        FROM manual_face_isolations mfi
                        JOIN assets a ON a.original_path = mfi.original_path
                        LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                        WHERE mfi.from_person_id = ?
                        GROUP BY a.id
                        ORDER BY mfi.created_at ASC
                    `).all(rejPersonId) as { id: string, original_path: string, width: number, height: number, preview_path: string | null }[];
            respond(id, 'ok', { assets: rejectedRows }, null, originWs);
        } catch (e: unknown) {
            respond(id, 'error', null, e instanceof Error ? e.message : String(e), originWs);
        }
        return true;
    }

        default:
    throw new Error(`Unknown command: ${command} `);
}

}
