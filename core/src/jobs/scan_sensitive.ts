import { DatabaseManager } from '../db';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, createWriteStream, promises as fs } from 'node:fs';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import * as https from 'node:https';
import * as http from 'node:http';

// ─── Model Caching ───────────────────────────────────────────────────────────

const NSFWJS_MODEL_BASE =
    'https://raw.githubusercontent.com/infinitered/nsfwjs/master/models/mobilenet_v2';
// The model json references weight files relative to itself, we keep all in one dir.
const MODEL_DIR_NAME = 'nsfwjs';

// Core files — the shard list is also discovered dynamically from model.json
const MODEL_CORE_FILES = [
    'model.json',
    'group1-shard1of1',  // extension-free in current nsfwjs repo
];

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https://') ? https : http;
        const out = createWriteStream(dest);
        const req = protocol.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode !== 200) {
                out.close();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            res.pipe(out);
            out.on('finish', () => out.close(() => resolve()));
        });
        req.on('error', (err) => {
            out.close();
            reject(err);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout downloading ${url}`));
        });
    });
}

async function ensureModel(modelsDir: string): Promise<string> {
    const modelDir = join(modelsDir, MODEL_DIR_NAME);
    if (!existsSync(modelDir)) {
        mkdirSync(modelDir, { recursive: true });
    }

    const modelJsonPath = join(modelDir, 'model.json');
    if (!existsSync(modelJsonPath)) {
        console.log('[NSFWScanner] Downloading NSFW model (first run only)…');

        // Download and parse model.json first to discover all shard paths
        await downloadFile(`${NSFWJS_MODEL_BASE}/model.json`, modelJsonPath);
        const manifest = JSON.parse(await fs.readFile(modelJsonPath, 'utf8'));
        const shards: string[] = [...new Set<string>(
            manifest.weightsManifest.flatMap((g: any) => g.paths as string[])
        )];
        console.log(`[NSFWScanner] Discovered ${shards.length} shard(s):`, shards);

        // Also ensure we cover the statically-known names in case manifest format changes
        const allFiles = [...new Set([...MODEL_CORE_FILES.slice(1), ...shards])];
        for (const file of allFiles) {
            const dest = join(modelDir, file);
            if (!existsSync(dest)) {
                console.log(`[NSFWScanner] Downloading ${file}…`);
                await downloadFile(`${NSFWJS_MODEL_BASE}/${file}`, dest);
            }
        }
        console.log('[NSFWScanner] Model download complete.');
    }
    return `file://${modelDir.replace(/\\/g, '/')}/model.json`;
}



// ─── Sensitivity Scoring ─────────────────────────────────────────────────────

export function scoreFromPredictions(predictions: Array<{ className: string; probability: number }>): number {
    // Classes: Drawing, Hentai, Neutral, Porn, Sexy
    const sensitive = ['Porn', 'Sexy', 'Hentai'];
    const score = predictions
        .filter(p => sensitive.includes(p.className))
        .reduce((acc, p) => acc + p.probability, 0);
    return Math.round(Math.min(score, 1) * 100);
}

export function sensitivityTier(score: number): 'safe' | 'review' | 'unsafe' {
    if (score < 25) return 'safe';
    if (score < 75) return 'review';
    return 'unsafe';
}

// ─── Job ─────────────────────────────────────────────────────────────────────

let _nsfwModel: any = null;
let _tf: any = null;
let _nsfwjs: any = null;
let _sharp: any = null;

async function loadModel(modelsDir: string) {
    if (_nsfwModel) return _nsfwModel;

    // Lazy-load TF, nsfwjs and sharp to avoid startup overhead
    if (!_tf) {
        _tf = await import('@tensorflow/tfjs-node');
    }
    if (!_nsfwjs) {
        _nsfwjs = await import('nsfwjs');
    }
    if (!_sharp) {
        _sharp = (await import('sharp')).default;
    }

    const modelPath = await ensureModel(modelsDir);
    console.log(`[NSFWScanner] Loading model from ${modelPath}…`);
    _nsfwModel = await _nsfwjs.load(modelPath, { size: 224 });
    console.log('[NSFWScanner] Model loaded.');
    return _nsfwModel;
}

export async function runSensitiveScanJob(
    mediaIds: string[] | 'auto',
    dbManager: DatabaseManager,
    eventBus: EventBus,
    force = false    // When true, re-scan even if already scored
): Promise<void> {
    const db = dbManager.getDb();
    const libraryDir = dirname(db.name);
    const modelsDir = join(libraryDir, '..', 'models'); // peer to library.db
    // Prefer the core/models dir if it exists (development)
    const coreModelsDir = join(process.cwd(), 'models');
    const effectiveModelsDir = existsSync(coreModelsDir) ? coreModelsDir : modelsDir;

    if (!existsSync(effectiveModelsDir)) {
        mkdirSync(effectiveModelsDir, { recursive: true });
    }

    // When force=true, reset scores first so the WHERE clause below includes them
    if (force) {
        if (mediaIds === 'auto') {
            console.log('[NSFWScanner] Force mode: clearing all existing sensitivity scores…');
            db.prepare('UPDATE assets SET sensitivity_score = NULL').run();
        } else {
            const placeholders = mediaIds.map(() => '?').join(',');
            console.log(`[NSFWScanner] Force mode: clearing sensitivity scores for ${mediaIds.length} assets…`);
            db.prepare(`UPDATE assets SET sensitivity_score = NULL WHERE id IN (${placeholders})`).run(...mediaIds);
        }
    }

    // Determine items to process
    let rows: { id: string; preview_path: string }[];
    if (mediaIds === 'auto') {
        rows = db.prepare(`
            SELECT a.id, p.path as preview_path
            FROM assets a
            INNER JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
            WHERE a.sensitivity_score IS NULL
            ORDER BY a.created_at ASC
        `).all() as any[];
    } else {
        const placeholders = mediaIds.map(() => '?').join(',');
        rows = db.prepare(`
            SELECT a.id, p.path as preview_path
            FROM assets a
            INNER JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
            WHERE a.id IN (${placeholders})
            AND a.sensitivity_score IS NULL
        `).all(...mediaIds) as any[];
    }

    if (rows.length === 0) {
        console.log('[NSFWScanner] Nothing to scan.');
        return;
    }

    const jobId = `sensitive-${Date.now()}`;
    const totalItems = rows.length;
    let processed = 0;
    let errors = 0;
    const startTime = Date.now();
    let lastReportTime = startTime;

    eventBus.emit({ type: 'JobStarted', jobId, pipelineStage: 'sensitive_scan', totalItems });

    const reportProgress = (currentItemPath?: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastReportTime < 800) return;
        const elapsedSec = (now - startTime) / 1000;
        const throughputIps = elapsedSec > 0 ? processed / elapsedSec : 0;
        eventBus.emit({
            type: 'JobProgress',
            jobId,
            processedItems: processed,
            totalItems,
            currentItemPath,
            throughputIps,
            errorCount: errors
        });
        lastReportTime = now;
    };

    let model: any;
    try {
        model = await loadModel(effectiveModelsDir);
    } catch (e: any) {
        console.error('[NSFWScanner] Failed to load model:', e.message);
        eventBus.emit({ type: 'JobFailed', jobId, severity: 'fatal', reason: `Model load failed: ${e.message}` });
        return;
    }

    for (const row of rows) {
        await waitIfPaused();
        try {
            if (!existsSync(row.preview_path)) {
                errors++;
                processed++;
                reportProgress();
                continue;
            }

            // tf.node.decodeImage only supports BMP/JPEG/PNG/GIF — thumbnails are WebP.
            // Convert to PNG in-memory via sharp (no temp file needed).
            const rawBuffer = await fs.readFile(row.preview_path);
            const pngBuffer = await _sharp(rawBuffer).png().toBuffer();
            const tensor = _tf.node.decodeImage(pngBuffer, 3) as any;
            const predictions = await model.classify(tensor);
            tensor.dispose();

            const score = scoreFromPredictions(predictions);
            const tier = sensitivityTier(score);

            db.prepare(`
                UPDATE assets SET sensitivity_score = ? WHERE id = ?
            `).run(score, row.id);

            // If auto-flagged as safe, ensure no manual override blocks cloud usage by default
            // (manual overrides are separate in assets_manual table)

            console.log(`[NSFWScanner] ${row.id}: score=${score}% tier=${tier}`);

            eventBus.emit({
                type: 'SensitivityScored',
                mediaId: row.id,
                score,
                tier
            } as any);

            processed++;
            reportProgress(row.preview_path);
        } catch (e: any) {
            console.error(`[NSFWScanner] Failed for ${row.id}:`, e.message);
            errors++;

            try {
                const { v4: uuidv4 } = await import('uuid');
                db.prepare(`
                    INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
                    VALUES (?, ?, ?, 'sensitive_scan', 'warning', ?)
                `).run(uuidv4(), row.id, jobId, e.message);
            } catch { /* ignore log failures */ }

            processed++;
            reportProgress();
        }
    }

    reportProgress(undefined, true);
    eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'sensitive_scan' } as any);
    console.log(`[NSFWScanner] Done. ${processed - errors} succeeded, ${errors} errors.`);
}
