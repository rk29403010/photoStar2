
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { DatabaseManager } from './db';
import { runScanJob } from './jobs/scan';
import { runPreviewJob } from './jobs/previews';
import { runFaceDetectionJob } from './jobs/detect_faces';
import { runFaceRecognitionJob } from './jobs/recognise_faces';
import { runFaceClusteringJob } from './jobs/cluster_faces';
// New imports
import { EventBus } from './events/bus';
import { Coordinator } from './coordinator';
import { DomainEvent } from './events/types';
import { WebSocketServer, WebSocket } from 'ws';

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
// Triggered when Faces are detected. Debounced because detect_faces emits this per image.
let recognitionTimeout: NodeJS.Timeout | null = null;
eventBus.subscribe('FacesDetected', () => {
    if (recognitionTimeout) clearTimeout(recognitionTimeout);
    recognitionTimeout = setTimeout(() => {
        console.log('[Worker] Starting Face Recognition (Debounced)');
        runFaceRecognitionJob('recog-sweep', dbManager, eventBus).catch(e => console.error(e));
    }, 2000);
});

// 4. Face Clustering
// Triggered when Embeddings are generated.
// We should debounce this heavily as it wipes/rebuilds.
let clusterTimeout: NodeJS.Timeout | null = null;
eventBus.subscribe('FaceEmbeddingGenerated', () => {
    if (clusterTimeout) clearTimeout(clusterTimeout);
    clusterTimeout = setTimeout(() => {
        console.log('[Worker] Starting Face Clustering (Debounced)');
        runFaceClusteringJob('', dbManager, eventBus).catch(e => console.error(e));
    }, 2000); // Wait 2s
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
                runFaceDetectionJob(id, dbManager, eventBus);
                break;
            case 'recognise_faces':
                respond(id, 'ok', { message: 'Face recognition started' }, null, originWs);
                runFaceRecognitionJob(id, dbManager, eventBus);
                break;
            case 'cluster_faces':
                respond(id, 'ok', { message: 'Clustering started' }, null, originWs);
                runFaceClusteringJob(id, dbManager, eventBus);
                break;

            case 'get_people':
                try {
                    console.error('[Sidecar] Handling get_people');
                    const people = dbManager.getDb().prepare(`
                        SELECT p.id, p.name, COUNT(fa.asset_id) as face_count,
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
                    const rows = dbManager.getDb().prepare(`
                      SELECT a.id, a.original_path, a.width, a.height,
                             (SELECT path FROM previews WHERE asset_id = a.id AND size = 'thumbnail' ORDER BY version DESC LIMIT 1) as preview_path,
                             dr.data as faces_data, fr.data as rec_data
                      FROM assets a
                      LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'face_detection'
                      LEFT JOIN derived_results fr ON a.id = fr.asset_id AND fr.task = 'face_recognition'
                      GROUP BY a.id
                      ORDER BY a.created_at DESC
                      LIMIT ?
                   `).all(limit) as any[];

                    const assets = rows.map(row => ({
                        ...row,
                        faces: row.faces_data ? JSON.parse(row.faces_data).faces : [],
                        face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : []
                    }));

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
                    console.error(`[Sidecar] Aborting job: ${jobIdToAbort}`);
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
                        const activeCount = activeJobIds.filter(id => id.startsWith(kindPrefix)).length;
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
                            title: 'Face Analysis',
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
                            title: 'Face Mapping',
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
                        }
                    ];

                    respond(id, 'ok', { jobs: systemJobs }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            case 'reset_library':
                try {
                    console.log(`Resetting library. Cancelling ${activeJobs.size} active jobs.`);
                    for (const [jobId, controller] of activeJobs.entries()) {
                        controller.abort();
                        activeJobs.delete(jobId);
                    }
                    const db = dbManager.getDb();
                    db.prepare('DELETE FROM events').run();
                    db.prepare('DELETE FROM derived_results').run();
                    db.prepare('DELETE FROM face_assignments').run();
                    db.prepare('DELETE FROM people').run();
                    db.prepare('DELETE FROM previews').run();
                    db.prepare('DELETE FROM jobs').run();
                    db.prepare('DELETE FROM assets').run();

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

            case 'reset_faces':
                try {
                    dbManager.getDb().prepare("DELETE FROM derived_results WHERE task = 'face_detection'").run();
                    respond(id, 'ok', { message: 'Face detection results cleared' }, null, originWs);
                } catch (e: any) {
                    respond(id, 'error', null, e.message, originWs);
                }
                break;

            default:
                throw new Error(`Unknown command: ${command}`);
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

server.listen(WS_PORT, () => {
    console.error(`[Dev] HTTP/WebSocket Bridge listening on port ${WS_PORT}`);
});

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
