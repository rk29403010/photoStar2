
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import { DatabaseManager } from './db';
import { runPreviewJob } from './jobs/previews';
import { runFaceDetectionJob } from './jobs/detect_faces';
import { runFaceRecognitionJob } from './jobs/recognise_faces';
import { runFaceClusteringJob } from './jobs/cluster_faces';
import { runSensitiveScanJob } from './jobs/scan_sensitive';
import { runComputeHashesJob } from './jobs/compute_hashes';
import { runDuplicateGroupingJob } from './jobs/build_duplicate_groups';
import { runVariantGroupingJob } from './jobs/build_variant_groups';
import { runBurstGroupingJob } from './jobs/build_burst_groups';
import { runAiMetadataJob } from './jobs/get_metadata_ai';
import { handleSystemCommand } from './handlers';
import { EventBus } from './events/bus';
import { Coordinator } from './coordinator';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

process.on('uncaughtException', (_err) => {
    console.error('[CRITICAL] Uncaught Exception:', _err);
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

// Apply system_log_level to suppress noisy info logs in production modes
const logLevel = dbManager.getSetting('system_log_level') || 'info';
if (logLevel === 'warn' || logLevel === 'error') {
    // Suppress console.log (info-level) messages; console.error still flows for critical output
    console.log = () => { /* silenced */ };
}

// workflow_auto_scan: if set to 'last_folder', re-scan the most recently used folder on startup
const autoScan = dbManager.getSetting('workflow_auto_scan');
if (autoScan === 'last_folder') {
    const db = dbManager.getDb();
    const lastFolder = db.prepare('SELECT path FROM folder_history ORDER BY last_scanned_at DESC LIMIT 1').get() as { path: string } | undefined;
    if (lastFolder?.path) {
        console.error(`[Startup] Auto-scan enabled. Resuming scan of: ${lastFolder.path}`);
        // Defer slightly so all subscribers are registered first
        setTimeout(() => {
            eventBus.emit({ type: 'FolderScanRequested', folderId: lastFolder.path, scanSessionId: 'startup-autoscan' });
            import('./jobs/scan').then(({ runScanJob }) => {
                runScanJob('startup-autoscan', lastFolder.path, dbManager, eventBus, new AbortController().signal)
                    .catch(err => console.error('[Startup] Auto-scan failed:', err));
            });
        }, 1500);
    }
}

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
    } catch (_err) {
        console.error('Failed to persist job event:', _err);
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
    } catch (_err) {
        console.error('[Cleanup] Failed:', _err);
    }
}

// Run cleanup on start and every 24 hours
performCleanup();
setInterval(performCleanup, 24 * 60 * 60 * 1000);

// Wiring: Workers listening to events
// 1. Preview Generation
eventBus.subscribe('MediaDiscovered', () => {
    // This event is handled by the coordinator, not directly by runPreviewJob
    // The coordinator will emit PreviewRequested if needed.
});

eventBus.subscribe('PreviewRequested', (event) => {
    console.log('[Worker] Event received: PreviewRequested'); // DEBUG LOG
    if (event.type === 'PreviewRequested') {
        console.log(`[Worker] Starting Previews for ${event.mediaIds.length} items`);
        runPreviewJob(event.mediaIds, dbManager, eventBus).catch(_err => console.error(_err));
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
eventBus.subscribe('SensitiveScanRequested', (event) => {
    if (event.type === 'SensitiveScanRequested') {
        const ids: string[] = event.mediaIds || [];
        console.log(`[Worker] Starting Sensitive Scan for ${ids.length} items`);
        runSensitiveScanJob(ids.length > 0 ? ids : 'auto', dbManager, eventBus).catch(console.error);
    }
});

// 6. AI Metadata Extraction
eventBus.subscribe('AiMetadataRequested', (event) => {
    if (event.type === 'AiMetadataRequested') {
        const ids: string[] = event.mediaIds || [];
        console.log(`[Worker] Starting AI Metadata extraction for ${ids.length} items`);
        runAiMetadataJob(ids.length > 0 ? ids : 'auto', dbManager, eventBus, event.jobId).catch(console.error);
    }
});

// 7. Grouping
eventBus.subscribe('ComputeHashesRequested', () => {
    console.log('[Worker] Starting Hash Computation');
    runComputeHashesJob('hash-sweep', dbManager, eventBus).catch(console.error);
});

eventBus.subscribe('DuplicateGroupingRequested', () => {
    console.log('[Worker] Starting Duplicate Grouping');
    runDuplicateGroupingJob('dup-sweep', dbManager, eventBus).catch(console.error);
});

eventBus.subscribe('VariantGroupingRequested', () => {
    console.log('[Worker] Starting Variant Grouping');
    runVariantGroupingJob('variant-sweep', dbManager, eventBus).catch(console.error);
});

eventBus.subscribe('BurstGroupingRequested', (event) => {
    if (event.type === 'BurstGroupingRequested') {
        console.log('[Worker] Starting Burst Grouping');
        runBurstGroupingJob(event.jobId || uuidv4(), dbManager, eventBus).catch(console.error);
    }
});

// 8. Asset Updated — re-query the asset and push to frontend so UI reflects new metadata
eventBus.subscribe('AssetUpdated', (event) => {
    if (event.type !== 'AssetUpdated') return;
    try {
        const db = dbManager.getDb();
        const row = db.prepare(`
            SELECT a.id, a.original_path, a.width, a.height, a.created_at,
                   a.sensitivity_score,
                   am.sensitivity_status,
                   p.path as preview_path,
                   dr.data as faces_data,
                   fr.data as rec_data,
                   aim.data as ai_metadata_data,
                   (
                       SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', fa.person_id, 'name', per.name))
                       FROM face_assignments fa
                       JOIN people per ON fa.person_id = per.id
                       WHERE fa.asset_id = a.id
                   ) as people_data
            FROM assets a
            LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
            LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'face_detection'
            LEFT JOIN derived_results fr ON a.id = fr.asset_id AND fr.task = 'face_recognition'
            LEFT JOIN derived_results aim ON a.id = aim.asset_id AND aim.task = 'ai_metadata'
            LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
            LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
            WHERE a.id = ?
        `).get(event.assetId) as { id: string, original_path: string, width: number, height: number, created_at: string, preview_path: string | null, faces_data: string | null, rec_data: string | null, people_data: string | null, ai_metadata_data: string | null, sensitivity_score: number | null, sensitivity_status: string | null } | undefined;

        if (!row) return;

        const faces = row.faces_data ? JSON.parse(row.faces_data).faces || [] : [];
        const peopleData = row.people_data ? JSON.parse(row.people_data) : [];
        faces.forEach((f: { person_id?: string, person_name?: string }, idx: number) => {
            const assignment = peopleData.find((p: { face_index: number, person_id: string, name: string }) => p.face_index === idx);
            if (assignment) { f.person_id = assignment.person_id; f.person_name = assignment.name; }
        });

        const aiMeta = row.ai_metadata_data ? JSON.parse(row.ai_metadata_data) : undefined;
        const asset = {
            ...row,
            faces,
            face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : [],
            ai_metadata: aiMeta,
            caption: aiMeta?.caption || undefined
        };

        // Push the updated asset to all connected frontends
        respond('event_stream', 'event', { type: 'AssetUpdated', asset });
        console.log(`[AssetUpdated] Pushed refreshed asset ${event.assetId} to frontend`);
    } catch (err) {
        console.error('[AssetUpdated] Failed to re-query asset:', err);
    }
});

// Define the schema for incoming WebSocket commands
const WsCommandSchema = z.object({
    id: z.string(),
    command: z.string(),
    payload: z.any().optional(),
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
            const rawMsg = JSON.parse(line);
            const msg = WsCommandSchema.parse(rawMsg);
            handleMessage(msg); // No ws param -> origin is stdin
        } catch (_err) {
            console.error('[DEBUG] Failed to parse message:', line, _err);
        }
    }
});

// Track active jobs (Legacy support + Scan cancellation)
const activeJobs = new Map<string, AbortController>();

async function handleMessage(msg: { id: string, command: string, payload?: unknown }, originWs?: WebSocket) {
    const { id, command, payload } = msg;
    try {

        handleSystemCommand({
            id,
            command,
            payload,
            originWs,
            dbManager,
            eventBus,
            coordinator,
            activeJobs,
            LIB_DIR,
            respond
        });
    } catch (err: unknown) {
        respond(id, 'error', null, err instanceof Error ? err.message : String(err), originWs);
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
                    stream.on('error', () => {
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


let listenRetries = 5;

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[Dev] Port ${WS_PORT} in use. Retrying in 1s... (${listenRetries} attempts left)`);
        listenRetries--;

        if (listenRetries <= 0) {
            console.error('[CRITICAL] Failed to bind port after 5 attempts.');
            process.exit(1);
        }

        try {
            // Intelligent targeted auto-kill. If the port is still bound, there's a zombie.
            // We find the process bound to 5174, and if it's not US, we kill it.

            if (os.platform() === 'win32') {
                const output = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue).OwningProcess"', { encoding: 'utf8' }).trim();
                if (output) {
                    const pids = output.split('\n').map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p !== process.pid);
                    for (const pid of pids) {
                        console.error(`[Dev] Port 5174 held by alien PID ${pid}. Executing targeted kill...`);
                        try { process.kill(pid, 9); } catch { /* ignore */ }
                    }
                }
            } else {
                try {
                    const output = execSync('lsof -ti:5174', { encoding: 'utf8' }).trim();
                    if (output) {
                        const pids = output.split('\n').map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p !== process.pid);
                        for (const pid of pids) {
                            console.error(`[Dev] Port 5174 held by alien PID ${pid}. Executing targeted kill...`);
                            try { process.kill(pid, 9); } catch { /* ignore */ }
                        }
                    }
                } catch { /* lsof fails if no process found */ }
            }
        } catch {
            // Ignore sweeping errors to let the natural retry loop continue
        }

        setTimeout(() => {
            server.close(); // Clean up handle
            server.listen(WS_PORT); // Retry
        }, 1000);
    } else {
        console.error('[CRITICAL] Server error:', err);
    }
});

wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') {
        console.error('[Dev] WebSocket Server error:', err);
    }
});

server.listen(WS_PORT, '0.0.0.0', () => {
    console.error(`[Dev] HTTP / WebSocket Bridge listening on port ${WS_PORT} (all interfaces)`);
});

process.on('exit', (code) => {
    console.error(`[Process Debug] Node process exiting with code: ${code}`);
});

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
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

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
    console.error('[Dev] UI connected via WebSocket');
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message: Buffer) => {
        try {
            const line = message.toString().trim();
            if (!line) return;
            const rawMsg = JSON.parse(line);
            const msg = WsCommandSchema.parse(rawMsg);
            handleMessage(msg, ws); // Pass the WS context
        } catch (e) {
            console.error('[Dev] WS Error parsing message:', e);
        }
    });

    ws.on('error', console.error);
});

function respond(id: string, status: 'ok' | 'error' | 'event', data: unknown = null, error: string | null = null, targetWs?: WebSocket) {
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
