
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { DatabaseManager } from './db';
import { runScanJob } from './jobs/scan';
import { runPreviewJob } from './jobs/previews';
import { runFaceDetectionJob } from './jobs/detect_faces';
import { runFaceRecognitionJob } from './jobs/recognise_faces';
import { runFaceClusteringJob } from './jobs/cluster_faces';
import { runSensitiveScanJob } from './jobs/scan_sensitive';
import { runAiMetadataJob } from './jobs/get_metadata_ai';
import { v4 as uuidv4 } from 'uuid';
// New imports
import { EventBus } from './events/bus';
import { Coordinator } from './coordinator';
import { DomainEvent } from './events/types';
import { WebSocketServer, WebSocket } from 'ws';
import { SystemState } from './state';

process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Constants
const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');

if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
}

console.log(`Core sidecar started. Storage: ${LIB_DIR}`);

const dbManager = new DatabaseManager(LIB_DIR);
const eventBus = new EventBus(dbManager);
const coordinator = new Coordinator(eventBus, dbManager);

// Wiring: Forward all events to frontend and persist job status
eventBus.subscribeAll((event) => {
    // 1. Persist task events to the DB for history
    try {
        const db = dbManager.getDb();
        if (event.type === 'JobStarted') {
            db.prepare(`
                INSERT OR REPLACE INTO jobs (id, stage, status, started_at, created_at, total_items)
                VALUES (?, ?, 'running', ?, ?, ?)
            `).run(event.jobId, event.pipelineStage, new Date().toISOString(), new Date().toISOString(), event.totalItems || 0);
        } else if (event.type === 'JobProgress') {
            db.prepare(`
                UPDATE jobs SET 
                    processed_items = ?, 
                    total_items = ?, 
                    current_item_path = ?, 
                    throughput_ips = ?, 
                    error_count = ?,
                    status = 'running'
                WHERE id = ?
            `).run(
                event.processedItems,
                event.totalItems || 0,
                event.currentItemPath || null,
                event.throughputIps || 0,
                event.errorCount || 0,
                event.jobId
            );
        } else if (event.type === 'JobCompleted') {
            db.prepare("UPDATE jobs SET status = 'completed', finished_at = ? WHERE id = ?")
                .run(new Date().toISOString(), event.jobId);
        } else if (event.type === 'JobFailed') {
            db.prepare("UPDATE jobs SET status = 'failed', finished_at = ? WHERE id = ?")
                .run(new Date().toISOString(), event.jobId);
        }
    } catch (e) {
        console.error('Failed to persist job event:', e);
    }

    // 2. Send to frontend
    respond('event_stream', 'event', event);
});

// Periodic Cleanup: Keep 30 days of history
function performCleanup() {
    console.log('[Cleanup] Running periodic cleanup of old jobs and events (30 day retention)');
    try {
        const db = dbManager.getDb();
        // Delete jobs older than 30 days
        const jobResult = db.prepare("DELETE FROM jobs WHERE created_at < date('now', '-30 days')").run();
        // Delete events older than 30 days
        const eventResult = db.prepare("DELETE FROM events WHERE created_at < date('now', '-30 days')").run();
        // Delete issues older than 30 days? Maybe keep fatal ones longer? 
        // For now let's just clean them too.
        const issueResult = db.prepare("DELETE FROM processing_issues WHERE created_at < date('now', '-30 days')").run();

        console.log(`[Cleanup] Removed ${jobResult.changes} old jobs, ${eventResult.changes} events, ${issueResult.changes} issues.`);
    } catch (e) {
        console.error('[Cleanup] Failed:', e);
    }
}

// Run cleanup on start and every 24 hours
performCleanup();
setInterval(performCleanup, 24 * 60 * 60 * 1000);

// Wiring: Workers listening to events
// 1. Preview Generation
eventBus.subscribe('PreviewRequested', (event) => {
    console.log('[Worker] Event received: PreviewRequested'); // DEBUG LOG
    if (event.type === 'PreviewRequested') {
        console.log(`[Worker] Starting Previews for ${event.mediaIds.length} items`);
        runPreviewJob(event.mediaIds, dbManager, eventBus).catch(e => console.error(e));
    }
});

// 2. Face Detection
eventBus.subscribe('FaceDetectionRequested', (event) => {
    if (event.type === 'FaceDetectionRequested') {
        const ids = event.mediaIds || (event.mediaId ? [event.mediaId] : []);
        if (ids.length > 0) {
            console.log(`[Worker] Starting Face Detection for ${ids.length} items`);
            runFaceDetectionJob(ids, dbManager, eventBus).catch(console.error);
        } else {
            console.log(`[Worker] Starting General Face Detection sweep`);
            runFaceDetectionJob('auto', dbManager, eventBus).catch(console.error);
        }
    }
});

// 3. Face Recognition
eventBus.subscribe('FaceRecognitionRequested', (event) => {
    if (event.type === 'FaceRecognitionRequested') {
        const ids = event.mediaIds || [];
        console.log(`[Worker] Starting Face Recognition for ${ids.length} items`);
        runFaceRecognitionJob(ids, dbManager, eventBus).catch(console.error);
    }
});

// 4. Face Clustering
eventBus.subscribe('FaceClusteringRequested', (event) => {
    if (event.type === 'FaceClusteringRequested') {
        console.log('[Worker] Starting Face Clustering');
        runFaceClusteringJob('cluster-sweep', dbManager, eventBus).catch(console.error);
    }
});

// 5. Sensitive Content Scan
eventBus.subscribe('SensitiveScanRequested' as any, (event: any) => {
    if (event.type === 'SensitiveScanRequested') {
        const ids: string[] = event.mediaIds || [];
        console.log(`[Worker] Starting Sensitive Scan for ${ids.length} items`);
        runSensitiveScanJob(ids.length > 0 ? ids : 'auto', dbManager, eventBus).catch(console.error);
    }
});

// 6. AI Metadata Extraction
eventBus.subscribe('AiMetadataRequested' as any, (event: any) => {
    if (event.type === 'AiMetadataRequested') {
        const ids: string[] = event.mediaIds || [];
        console.log(`[Worker] Starting AI Metadata extraction for ${ids.length} items`);
        runAiMetadataJob(ids.length > 0 ? ids : 'auto', dbManager, eventBus, event.jobId).catch(console.error);
    }
});

let buffer = '';
process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();

    // Process full lines
    let lineEndIndex;
    while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEndIndex).trim();
        buffer = buffer.slice(lineEndIndex + 1);

        if (!line) continue;

        try {
            // console.error('[DEBUG] Processing line:', line);
            const msg = JSON.parse(line);
            handleMessage(msg); // No ws param -> origin is stdin
        } catch (e) {
            console.error('[DEBUG] Failed to parse message:', line, e);
        }
    }
});

// Track active jobs (Legacy support + Scan cancellation)
const activeJobs = new Map<string, AbortController>();

async function handleMessage(msg: any, originWs?: WebSocket) {
    const { id, command, payload } = msg;
    try {
        let result = null;
        switch (command) {
            case 'ping':
                result = { message: 'pong', timestamp: Date.now() };
                respond(id, 'ok', result, null, originWs);
                break;
            case 'scan_folder':
                console.error('[Sidecar] Trace: scan_folder requested');
                let scanPath = payload.path;
                if (typeof scanPath === 'string') {
                    // Strip quotes if present
                    scanPath = scanPath.replace(/^["'](.+)["']$/, '$1').trim();
                }

                respond(id, 'ok', { message: 'Scan started', jobId: id }, null, originWs);

                // Update folder history
                try {
                    dbManager.getDb().prepare(`
                        INSERT OR REPLACE INTO folder_history (path, last_scanned_at) 
                        VALUES (?, ?)
                    `).run(scanPath, new Date().toISOString());
                } catch (e) {
                    console.error('Failed to update folder history:', e);
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
                    .catch(err => {
                        console.error('[Sidecar] Trace: runScanJob FAILED', err);
                    });
                break;

            case 'generate_previews':
                respond(id, 'ok', { message: 'Preview generation started' }, null, originWs);
                const allIds = dbManager.getDb().prepare('SELECT id FROM assets').all().map((a: any) => a.id);
                eventBus.emit({ type: 'PreviewRequested', mediaIds: allIds, reason: 'rebuild' });
                break;

            case 'detect_faces':
                respond(id, 'ok', { message: 'Face detection started' }, null, originWs);
                runFaceDetectionJob('auto', dbManager, eventBus);
                break;
            case 'recognise_faces':
                respond(id, 'ok', { message: 'Face recognition started' }, null, originWs);
                runFaceRecognitionJob('auto', dbManager, eventBus);
                break;
            case 'cluster_faces':
                respond(id, 'ok', { message: 'Clustering started' }, null, originWs);
                runFaceClusteringJob(id, dbManager, eventBus);
                break;

            case 'prioritize_asset_processing':
                respond(id, 'ok', { message: 'Priority boosted' }, null, originWs);
                try {
                    dbManager.getDb().prepare(`UPDATE task_queue SET priority = 100 WHERE media_id = ? AND status = 'pending'`).run(payload.mediaId);
                    // trigger coordinator evaluation trick
                    eventBus.emit({ type: 'JobCompleted', jobId: 'priority-boost', pipelineStage: 'system' });
                } catch (e: any) {
                    console.error('Failed to boost priority', e);
                }
                break;

            case 'pause_jobs':
                SystemState.isPaused = true;
                respond(id, 'ok', { message: 'System paused' }, null, originWs);
                // Broadcast state change to all clients
                eventBus.emit({ type: 'SystemPausedStateChanged', isPaused: true } as any);
                break;

            case 'resume_jobs':
                SystemState.isPaused = false;
                respond(id, 'ok', { message: 'System resumed' }, null, originWs);
                eventBus.emit({ type: 'SystemPausedStateChanged', isPaused: false } as any);
                // Kick start any pending work
                coordinator.forceEvaluate();
                break;

            case 'get_pause_state':
                respond(id, 'ok', { isPaused: SystemState.isPaused }, null, originWs);
                break;

            case 'rename_person':
                try {
                    const db = dbManager.getDb();
                    db.transaction(() => {
                        db.prepare(`
                            INSERT OR REPLACE INTO manual_face_names (original_path, face_index, name)
                            SELECT a.original_path, fa.face_index, ? 
                            FROM face_assignments fa 
                            JOIN assets a ON a.id = fa.asset_id 
                            WHERE fa.person_id = ?
                        `).run(payload.newName, payload.personId);

                        db.prepare("UPDATE people SET name = ? WHERE id = ?").run(payload.newName, payload.personId);
                    })();
                    respond(id, 'ok', { message: 'Person renamed' }, null, originWs);
                    eventBus.emit({ type: 'JobCompleted', jobId: 'rename', pipelineStage: 'analysis' }); // Trigger refresh
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'merge_people':
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
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'get_setting':
                try {
                    const row = dbManager.getDb().prepare('SELECT value FROM settings WHERE id = ?').get(payload.key) as { value: string } | undefined;
                    respond(id, 'ok', { value: row?.value || '' }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'set_setting':
                try {
                    dbManager.getDb().prepare('INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)').run(payload.key, payload.value);
                    respond(id, 'ok', { message: 'Setting saved' }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'extract_ai_metadata':
                respond(id, 'ok', { message: 'AI Metadata extraction started' }, null, originWs);
                // Payload might explicitly contain a mediaId for targeted updates
                eventBus.emit({ type: 'AiMetadataRequested', mediaIds: payload.mediaId ? [payload.mediaId] : [], jobId: id } as any);
                break;

            case 'isolate_face':
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
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'isolate_person_asset':
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
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'get_people':
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
                    `).all() as any[];
                    console.error(`[Sidecar] Found ${people.length} people`);
                    respond(id, 'ok', { people }, null, originWs);
                } catch (e: any) {
                    console.error('[Sidecar] get_people failed:', e);
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'get_assets':
                try {
                    const limit = payload.limit || 1000;
                    const filter = payload.filter as any;
                    const personIds: string[] = filter?.personIds || [];

                    let filterSubquery = '';
                    const params: any[] = [];

                    if (filter && personIds.length > 0) {
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

                    const sql = `
                      SELECT a.id, a.original_path, a.width, a.height, a.caption,
                        a.sensitivity_score,
                        am.sensitivity_status,
                        p.path as preview_path,
                        dr.data as faces_data, fr.data as rec_data, aim.data as ai_metadata_data,
                        (
                            SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', fa.person_id, 'name', per.name))
                            FROM face_assignments fa
                            JOIN people per ON fa.person_id = per.id
                            WHERE fa.asset_id = a.id
                        ) as people_data
                      FROM assets a
                      INNER JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                      LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'face_detection'
                      LEFT JOIN derived_results fr ON a.id = fr.asset_id AND fr.task = 'face_recognition'
                      LEFT JOIN derived_results aim ON a.id = aim.asset_id AND aim.task = 'ai_metadata'
                      LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
                      LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
                      WHERE 1=1 ${filterSubquery}
                      ORDER BY a.created_at ASC
                      LIMIT ?
                    `;
                    params.push(limit);

                    const rows = dbManager.getDb().prepare(sql).all(...params) as { id: string, original_path: string, width: number, height: number, preview_path: string | null, faces_data: string | null, rec_data: string | null, people_data: string | null, ai_metadata_data: string | null, sensitivity_score: number | null, sensitivity_status: string | null }[];

                    const assets = rows.map(row => {
                        const faces = row.faces_data ? JSON.parse(row.faces_data).faces : [];
                        const peopleData = row.people_data ? JSON.parse(row.people_data) : [];

                        // Merge names into faces
                        faces.forEach((f: { person_id?: string, person_name?: string }, idx: number) => {
                            const assignment = peopleData.find((p: { face_index: number, person_id: string, name: string }) => p.face_index === idx);
                            if (assignment) {
                                f.person_id = assignment.person_id;
                                f.person_name = assignment.name;
                            }
                        });

                        return {
                            ...row,
                            faces,
                            face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : [],
                            ai_metadata: row.ai_metadata_data ? JSON.parse(row.ai_metadata_data) : undefined
                        };
                    });

                    respond(id, 'ok', { assets }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'get_stats':
                try {
                    const db = dbManager.getDb();
                    const count = db.prepare('SELECT COUNT(*) as count FROM assets').get() as any;
                    const history = db.prepare('SELECT path, last_scanned_at FROM folder_history ORDER BY last_scanned_at DESC LIMIT 5').all();
                    respond(id, 'ok', { count: count.count, folderHistory: history }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'abort_job':
                const jobIdToAbort = payload.jobId;
                if (jobIdToAbort && activeJobs.has(jobIdToAbort)) {
                    console.error(`[Sidecar] Aborting job: ${jobIdToAbort} `);
                    activeJobs.get(jobIdToAbort)?.abort();
                    activeJobs.delete(jobIdToAbort);
                    respond(id, 'ok', { message: 'Abort signal sent' }, null, originWs);
                } else {
                    respond(id, 'error', null, 'Job not found or not active', originWs);
                }
                break;

            case 'get_system_jobs':
                try {
                    const db = dbManager.getDb();
                    const totalAssets = (db.prepare('SELECT COUNT(*) as count FROM assets').get() as any).count;

                    // Sum up totalItems from active scan jobs to get "incoming" count
                    const activeJobIds = Array.from(activeJobs.keys());
                    const incomingCount = db.prepare(`
                        SELECT COALESCE(SUM(total_items), 0) as incoming 
                        FROM jobs 
                        WHERE status = 'running' AND id LIKE 'scan-%'
                    `).get() as any;
                    const totalExpected = totalAssets + (incomingCount?.incoming || 0);

                    const donePreviews = (db.prepare("SELECT COUNT(DISTINCT asset_id) as count FROM previews WHERE size = 'thumbnail'").get() as any).count;
                    const doneDetection = (db.prepare("SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'face_detection'").get() as any).count;
                    const doneRecognition = (db.prepare("SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'face_recognition'").get() as any).count;
                    const getClassStats = (kindPrefix: string) => {
                        const activeCountRow = db.prepare(`SELECT count(*) as count FROM jobs WHERE id LIKE ? AND status = 'running'`).get(kindPrefix + '%') as any;
                        const activeCount = activeCountRow?.count || 0;
                        const avgQuery = db.prepare(`
                            SELECT AVG(strftime('%s', finished_at) - strftime('%s', started_at)) as avg_sec
                            FROM jobs
                            WHERE id LIKE ? AND status = 'completed' AND finished_at IS NOT NULL
                        `).get(kindPrefix + '%') as any;
                        const avgSec = avgQuery?.avg_sec || 0;

                        // Get most recent active job details for "Working on..."
                        const activeDetails = db.prepare(`
                            SELECT current_item_path, throughput_ips
                            FROM jobs
                            WHERE id LIKE ? AND status = 'running'
                            ORDER BY started_at DESC LIMIT 1
                        `).get(kindPrefix + '%') as any;

                        return {
                            activeCount,
                            avgSec,
                            current: activeDetails?.current_item_path,
                            throughput: activeDetails?.throughput_ips
                        };
                    };

                    const scanStats = getClassStats('scan-');
                    const previewStats = getClassStats('previews-');
                    const detectStats = getClassStats('detect-');
                    const recogStats = getClassStats('recog-');
                    const clusterStats = getClassStats('cluster-');
                    const aiMetaStats = getClassStats('ai_meta-');

                    const systemJobs = [
                        {
                            id: 'class-onboarding',
                            stage: 'onboarding',
                            title: 'Photo Onboarding',
                            state: scanStats.activeCount > 0 ? 'running' : 'idle',
                            activeCount: scanStats.activeCount,
                            avgDurationSec: scanStats.avgSec,
                            progress: {
                                overallTotal: incomingCount?.incoming || totalAssets,
                                overallDone: totalAssets,
                                overallPercent: (incomingCount?.incoming || 0) > 0 ? (totalAssets / (incomingCount?.incoming || 1)) * 100 : 100,
                                errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'scan'").get() as any).count,
                                current: scanStats.current,
                                throughputIps: scanStats.throughput
                            },
                            issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'ingest' OR task = 'scan' ORDER BY created_at DESC LIMIT 5").all()
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
                                errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'preview'").get() as any).count,
                                current: previewStats.current,
                                throughputIps: previewStats.throughput
                            },
                            issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'preview' ORDER BY created_at DESC LIMIT 5").all()
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
                                errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'detection'").get() as any).count,
                                current: detectStats.current,
                                throughputIps: detectStats.throughput
                            },
                            issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'detection' ORDER BY created_at DESC LIMIT 5").all()
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
                                errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'recognition'").get() as any).count,
                                current: recogStats.current,
                                throughputIps: recogStats.throughput
                            },
                            issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'recognition' ORDER BY created_at DESC LIMIT 5").all()
                        },
                        {
                            id: 'class-clustering',
                            stage: 'analysis',
                            title: 'Face Clustering',
                            state: clusterStats.activeCount > 0 ? 'running' : 'idle', // Clustering doesn't have a rigid 1:1 total so reporting "complete" vs "idle" is nuanced. Idle is safer.
                            activeCount: clusterStats.activeCount,
                            avgDurationSec: clusterStats.avgSec,
                            progress: {
                                overallTotal: doneRecognition, // Number of faces expected vs done is hard to quantify without counting faces.
                                overallDone: 0,
                                overallPercent: 100, // Show a spinner or generic indicator since discrete clustering percentage is complex
                                errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'clustering'").get() as any).count,
                                current: clusterStats.current,
                                throughputIps: clusterStats.throughput
                            },
                            issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'clustering' ORDER BY created_at DESC LIMIT 5").all()
                        },
                        (() => {
                            const sensitiveStats = getClassStats('sensitive-');
                            const doneScored = (db.prepare("SELECT COUNT(*) as count FROM assets WHERE sensitivity_score IS NOT NULL").get() as any).count;
                            return {
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
                                    errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'sensitive_scan'").get() as any).count,
                                    current: sensitiveStats.current,
                                    throughputIps: sensitiveStats.throughput
                                },
                                issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'sensitive_scan' ORDER BY created_at DESC LIMIT 5").all()
                            };
                        })(),
                        (() => {
                            const doneScored = (db.prepare("SELECT COUNT(*) as count FROM derived_results WHERE task = 'ai_metadata'").get() as any).count;
                            return {
                                id: 'class-aimetadata',
                                stage: 'analysis',
                                title: 'Extract AI Metadata',
                                state: aiMetaStats.activeCount > 0 ? 'running' : 'idle',
                                activeCount: aiMetaStats.activeCount,
                                avgDurationSec: aiMetaStats.avgSec,
                                progress: {
                                    overallTotal: totalExpected,
                                    overallDone: doneScored,
                                    overallPercent: totalExpected > 0 ? (doneScored / totalExpected) * 100 : 100,
                                    errors: (db.prepare("SELECT COUNT(*) as count FROM processing_issues WHERE task = 'ai_metadata'").get() as any).count,
                                    current: aiMetaStats.current,
                                    throughputIps: aiMetaStats.throughput
                                },
                                issues: db.prepare("SELECT id, message, severity, created_at FROM processing_issues WHERE task = 'ai_metadata' ORDER BY created_at DESC LIMIT 5").all()
                            };
                        })()
                    ];

                    respond(id, 'ok', { jobs: systemJobs }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'reset_library':
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
                    db.prepare('DELETE FROM assets').run();
                    // NOTE: asset_identities and assets_manual are NOT deleted — they survive factory reset

                    const previewsDir = join(LIB_DIR, 'previews');
                    if (existsSync(previewsDir)) {
                        try {
                            rmSync(previewsDir, { recursive: true, force: true });
                        } catch (err) { }
                    }
                    respond(id, 'ok', { message: 'Library reset complete' }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'scan_sensitive':
                respond(id, 'ok', { message: 'Sensitive content scan started' }, null, originWs);
                runSensitiveScanJob('auto', dbManager, eventBus).catch(console.error);
                break;

            case 'scan_sensitive_force':
                // Re-scan ALL assets, clearing existing scores first
                respond(id, 'ok', { message: 'Force re-scan of all assets started' }, null, originWs);
                runSensitiveScanJob('auto', dbManager, eventBus, true).catch(console.error);
                break;

            case 'get_sensitivity':
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
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'set_sensitivity':
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
                    eventBus.emit({ type: 'JobCompleted', jobId: 'set-sensitivity', pipelineStage: 'manual' } as any);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'reset_faces':
                try {
                    dbManager.getDb().prepare("DELETE FROM derived_results WHERE task = 'face_detection'").run();
                    respond(id, 'ok', { message: 'Face detection results cleared' }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'get_rejected_assets_for_person':
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
                    `).all(rejPersonId) as any[];
                    respond(id, 'ok', { assets: rejectedRows }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            default:
                throw new Error(`Unknown command: ${command} `);
        }
    } catch (err: any) {
        respond(id, 'error', null, err.message, originWs);
    }
}

// WebSocket Dev Bridge
const WS_PORT = 5174;

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';

const server = createServer((req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url && req.url.startsWith('/image?path=')) {
        try {
            // Very naive URL parsing for the path param
            const pathParam = req.url.split('path=')[1];
            if (pathParam) {
                const filePath = decodeURIComponent(pathParam);
                if (existsSync(filePath)) {
                    const ext = filePath.split('.').pop()?.toLowerCase() || '';
                    const mimeTypes: Record<string, string> = {
                        'png': 'image/png',
                        'jpg': 'image/jpeg',
                        'jpeg': 'image/jpeg',
                        'webp': 'image/webp',
                        'gif': 'image/gif'
                    };
                    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');

                    const stream = createReadStream(filePath);
                    stream.pipe(res);
                    stream.on('error', (err) => {
                        res.writeHead(500);
                        res.end('Error reading file');
                    });
                    return;
                }
            }
        } catch (e) {
            console.error('Image serve error:', e);
        }
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    res.writeHead(404);
    res.end();
});

const wss = new WebSocketServer({ server });

import { execSync } from 'node:child_process';
import * as os from 'node:os';

function startServer(port: number, retries = 5) {
    server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Dev] Port ${port} in use. Attempting to kill hanging process...`);
            try {
                if (os.platform() === 'win32') {
                    execSync(`powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
                } else {
                    execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' });
                }
            } catch (e) {
                // Ignore errors
            }
            if (retries > 0) {
                setTimeout(() => startServer(port, retries - 1), 1000);
            } else {
                console.error('[CRITICAL] Failed to bind port after 5 attempts.');
                process.exit(1);
            }
        }
    });

    server.listen(port, () => {
        console.error(`[Dev] HTTP / WebSocket Bridge listening on port ${port}`);
    });
}

startServer(WS_PORT);

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
        if (ws.isAlive === false) {
            console.error('[Dev] Terminating dead WebSocket connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

wss.on('connection', (ws: any) => {
    console.error('[Dev] UI connected via WebSocket');
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message: any) => {
        try {
            const line = message.toString().trim();
            if (!line) return;
            const msg = JSON.parse(line);
            handleMessage(msg, ws); // Pass the WS context
        } catch (e) {
            console.error('[Dev] WS Error parsing message:', e);
        }
    });

    ws.on('error', console.error);
});

function respond(id: string, status: 'ok' | 'error' | 'event', data: any = null, error: string | null = null, targetWs?: WebSocket) {
    const payloadStr = JSON.stringify({ id, status, data, error });

    // 1. Stdout (Tauri / Local Terminal)
    // If targetWs is defined, this was a specific request from the web bridge.
    // We don't need to flood stdout with the same data.
    if (!targetWs) {
        // Truncation for extreme payloads on stdout (safety)
        if (payloadStr.length > 20000 && process.stdout.isTTY) {
            console.log(JSON.stringify({
                id,
                status,
                data: { summary: 'Large payload truncated for terminal visibility', length: payloadStr.length },
                error
            }));
        } else {
            console.log(payloadStr);
        }
    }

    // 2. WebSocket
    if (targetWs && targetWs.readyState === 1) {
        targetWs.send(payloadStr);
    } else {
        // Broadcast to all (for events)
        for (const client of wss.clients) {
            if (client.readyState === 1 /* OPEN */) {
                client.send(payloadStr);
            }
        }
    }
}

// --- Clean Shutdown Handlers ---
const shutdown = () => {
    console.log('[Dev] Shutdown signal received. Closing servers...');
    wss.close();
    server.close(() => {
        console.log('[Dev] HTTP/WS Server closed. Exiting.');
        process.exit(0);
    });

    // Force exit if server.close hangs
    setTimeout(() => {
        console.log('[Dev] Shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 2000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
