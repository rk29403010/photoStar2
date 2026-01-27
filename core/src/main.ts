import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseManager } from './db';
import { runScanJob } from './jobs/scan';
import { runPreviewJob } from './jobs/previews';
import { runFaceDetectionJob } from './jobs/detect_faces';
import { runFaceRecognitionJob } from './jobs/recognise_faces';
import { runFaceClusteringJob } from './jobs/cluster_faces';

// Constants
const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');

if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
}

console.log(`Core sidecar started. Storage: ${LIB_DIR}`);

const dbManager = new DatabaseManager(LIB_DIR);

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
            console.error('[DEBUG] Processing line:', line);
            const msg = JSON.parse(line);
            handleMessage(msg);
        } catch (e) {
            console.error('[DEBUG] Failed to parse message:', line, e);
        }
    }
});

async function handleMessage(msg: any) {
    const { id, command, payload } = msg;
    try {
        let result = null;
        switch (command) {
            case 'ping':
                result = { message: 'pong', timestamp: Date.now() };
                respond(id, 'ok', result);
                break;
            case 'scan_folder':
                respond(id, 'ok', { message: 'Scan started', jobId: id });
                runScanJob(id, payload.path, dbManager, (progress) => {
                    respond(id, 'event', progress);
                });
                break;
            case 'generate_previews':
                respond(id, 'ok', { message: 'Preview generation started', jobId: id });
                runPreviewJob(id, dbManager, (progress) => {
                    respond(id, 'event', progress);
                });
                break;
            case 'detect_faces':
                respond(id, 'ok', { message: 'Face detection started', jobId: id });
                runFaceDetectionJob(id, dbManager, (progress) => {
                    respond(id, 'event', progress);
                });
                break;
            case 'recognise_faces':
                respond(id, 'ok', { message: 'Face recognition started', jobId: id });
                runFaceRecognitionJob(id, dbManager, (progress) => {
                    respond(id, 'event', progress);
                });
                break;
            case 'cluster_faces':
                respond(id, 'ok', { message: 'Clustering started', jobId: id });
                runFaceClusteringJob(id, dbManager, (progress) => {
                    respond(id, 'event', progress);
                });
                break;
            case 'get_people':
                try {
                    const people = dbManager.getDb().prepare(`
                        SELECT p.id, p.name, COUNT(fa.asset_id) as face_count,
                               (SELECT a.original_path FROM assets a
                                JOIN face_assignments fa2 ON fa2.asset_id = a.id
                                WHERE fa2.person_id = p.id
                                ORDER BY fa2.confidence DESC LIMIT 1) as cover_image
                        FROM people p
                        LEFT JOIN face_assignments fa ON fa.person_id = p.id
                        GROUP BY p.id
                        ORDER BY face_count DESC
                    `).all();
                    respond(id, 'ok', { people });
                } catch (e: any) {
                    respond(id, 'error', null, e.message);
                }
                break;
            case 'get_assets':
                try {
                    const limit = payload.limit || 100;
                    // Join to get thumbnail path
                    const rows = dbManager.getDb().prepare(`
                      SELECT a.id, a.original_path, a.width, a.height, p.path as preview_path, 
                             dr.data as faces_data, fr.data as rec_data
                      FROM assets a
                      LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                      LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'face_detection'
                      LEFT JOIN derived_results fr ON a.id = fr.asset_id AND fr.task = 'face_recognition'
                      ORDER BY a.created_at DESC
                      LIMIT ?
                   `).all(limit) as any[];

                    const assets = rows.map(row => ({
                        ...row,
                        faces: row.faces_data ? JSON.parse(row.faces_data).faces : [],
                        face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : []
                    }));

                    respond(id, 'ok', { assets });
                } catch (e: any) {
                    respond(id, 'error', null, e.message);
                }
                break;
            case 'get_stats':
                try {
                    const count = dbManager.getDb().prepare('SELECT COUNT(*) as count FROM assets').get() as any;
                    respond(id, 'ok', { count: count.count });
                } catch (e: any) {
                    respond(id, 'error', null, e.message);
                }
                break;
            case 'reset_library':
                try {
                    const db = dbManager.getDb();
                    // Delete data but keep tables
                    db.prepare('DELETE FROM derived_results').run();
                    db.prepare('DELETE FROM previews').run();
                    db.prepare('DELETE FROM jobs').run();
                    db.prepare('DELETE FROM assets').run();

                    // Vacuum to reclaim space and reset connection state if needed (optional)
                    // db.exec('VACUUM'); 

                    respond(id, 'ok', { message: 'Library reset complete' });
                } catch (e: any) {
                    respond(id, 'error', null, e.message);
                }
                break;
            case 'reset_faces':
                try {
                    dbManager.getDb().prepare("DELETE FROM derived_results WHERE task = 'face_detection'").run();
                    respond(id, 'ok', { message: 'Face detection results cleared' });
                } catch (e: any) {
                    respond(id, 'error', null, e.message);
                }
                break;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    } catch (err: any) {
        respond(id, 'error', null, err.message);
    }
}

function respond(id: string, status: 'ok' | 'error' | 'event', data: any = null, error: string | null = null) {
    console.log(JSON.stringify({ id, status, data, error }));
}
