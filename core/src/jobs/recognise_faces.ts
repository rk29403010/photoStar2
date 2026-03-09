import { join, dirname } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { DatabaseManager } from '../db';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';

const MODEL_FILENAME = 'w600k_r50.onnx';
let MODEL_PATH = join(dirname(process.execPath), 'models', MODEL_FILENAME);

if (!existsSync(MODEL_PATH)) {
    MODEL_PATH = join(__dirname, '../../../../models', MODEL_FILENAME);
}

class FaceRecogniser {
    private session: ort.InferenceSession | null = null;

    async init() {
        if (this.session) {return;}
        let usableModelPath = MODEL_PATH;
        if (MODEL_PATH.includes('snapshot')) {
            const tmpDir = tmpdir();
            const tmpPath = join(tmpDir, MODEL_FILENAME);
            if (!existsSync(tmpPath)) {
                copyFileSync(MODEL_PATH, tmpPath);
            }
            usableModelPath = tmpPath;
        }
        const options: ort.InferenceSession.SessionOptions = { logSeverityLevel: 3 };
        this.session = await ort.InferenceSession.create(usableModelPath, options);
    }

    async computeEmbedding(imagePath: string, box: number[]): Promise<number[] | null> {
        if (!this.session) {throw new Error('Model not loaded');}

        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const iw = metadata.width || 0;
        const ih = metadata.height || 0;

        let x1 = box[0] * iw;
        let y1 = box[1] * ih;
        const x2 = box[2] * iw;
        const y2 = box[3] * ih;

        let bw = x2 - x1;
        let bh = y2 - y1;
        const cx = x1 + bw / 2;
        const cy = y1 + bh / 2;
        const size = Math.max(bw, bh) * 1.3;

        x1 = Math.max(0, cx - size / 2);
        y1 = Math.max(0, cy - size / 2);
        bw = size;
        bh = size;

        if (x1 + bw > iw) {bw = iw - x1;}
        if (y1 + bh > ih) {bh = ih - y1;}

        const buffer = await image
            .extract({ left: Math.round(x1), top: Math.round(y1), width: Math.round(bw), height: Math.round(bh) })
            .resize(112, 112, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer();

        const float32Data = new Float32Array(3 * 112 * 112);
        for (let i = 0; i < 112 * 112; i++) {
            float32Data[i] = (buffer[i * 3] - 127.5) / 128;
            float32Data[i + 112 * 112] = (buffer[i * 3 + 1] - 127.5) / 128;
            float32Data[i + 2 * 112 * 112] = (buffer[i * 3 + 2] - 127.5) / 128;
        }

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, 112, 112]);
        const results = await this.session.run({ 'input.1': tensor });
        const outputKey = Object.keys(results)[0];
        const embedding = results[outputKey].data as Float32Array;

        return Array.from(embedding);
    }
}

type RecognitionAsset = { asset_id: string; data: string; original_path: string };

function resolveRecognitionAssets(
    db: ReturnType<DatabaseManager['getDb']>,
    targetInput: string | string[]
): RecognitionAsset[] {
    if (Array.isArray(targetInput) && targetInput.length > 0) {
        const placeholders = targetInput.map(() => '?').join(',');
        return db.prepare(`
            SELECT d.asset_id, d.data, a.original_path 
            FROM derived_results d
            JOIN assets a ON a.id = d.asset_id
            WHERE d.task = 'face_detection' AND a.id IN (${placeholders})
        `).all(...targetInput) as RecognitionAsset[];
    }

    if (typeof targetInput === 'string' && !targetInput.includes('sweep') && !targetInput.includes('auto')) {
        return db.prepare(`
            SELECT d.asset_id, d.data, a.original_path 
            FROM derived_results d
            JOIN assets a ON a.id = d.asset_id
            WHERE d.task = 'face_detection' AND a.id = ?
        `).all(targetInput) as RecognitionAsset[];
    }

    return db.prepare(`
        SELECT d.asset_id, d.data, a.original_path 
        FROM derived_results d
        JOIN assets a ON a.id = d.asset_id
        WHERE d.task = 'face_detection'
        AND d.asset_id NOT IN (
            SELECT asset_id FROM derived_results WHERE task = 'face_recognition'
        )
    `).all() as RecognitionAsset[];
}

function emitRecognitionProgress(
    eventBus: EventBus,
    jobId: string,
    processed: number,
    totalItems: number,
    errors: number,
    startTime: number,
    lastReportTime: number,
    currentItemPath?: string,
    force = false
): number {
    const now = Date.now();
    if (!force && now - lastReportTime < 500) {return lastReportTime;}
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
    return now;
}

async function initRecogniserOrFail(recogniser: FaceRecogniser, eventBus: EventBus, jobId: string): Promise<boolean> {
    try {
        await recogniser.init();
        return true;
    } catch (err: unknown) {
        const e = err as Error;
        eventBus.emit({ type: 'JobFailed', jobId, severity: 'fatal', reason: `Recognition init failed: ${e.message}` });
        return false;
    }
}

async function buildEmbeddings(
    recogniser: FaceRecogniser,
    row: RecognitionAsset,
    eventBus: EventBus
): Promise<Array<number[] | null>> {
    const detectionData = JSON.parse(row.data);
    const faces = detectionData.faces || [];
    const embeddings: Array<number[] | null> = [];

    for (const face of faces) {
        if (!face.box || !face.landmarks) {
            embeddings.push(null);
            continue;
        }
        try {
            const emb = await recogniser.computeEmbedding(row.original_path, face.box);
            embeddings.push(emb);
            if (emb && face.id) {eventBus.emit({ type: 'FaceEmbeddingGenerated', mediaId: row.asset_id, faceId: face.id });}
        } catch (e) {
            console.error('Recog error:', e);
            embeddings.push(null);
        }
    }

    return embeddings;
}

export async function runFaceRecognitionJob(
    targetInput: string | string[],
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal,
    uiJobId?: string
) {
    const db = dbManager.getDb();
    const assets = resolveRecognitionAssets(db, targetInput);

    const generatedJobId = targetInput === 'auto' ? `recog-auto-${Date.now()}` : `recog-batch-${Date.now()}`;
    const jobId = uiJobId || generatedJobId;

    if (assets.length === 0) {
        if (uiJobId) {
            eventBus.emit({ type: 'JobStarted', jobId, pipelineStage: 'recognition', totalItems: 0 });
            eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'recognition' });
        }
        return;
    }
    const totalItems = assets.length;
    let processed = 0;
    let errors = 0;
    const startTime = Date.now();
    let lastReportTime = startTime;

    eventBus.emit({
        type: 'JobStarted',
        jobId,
        pipelineStage: 'recognition',
        totalItems
    });

    lastReportTime = emitRecognitionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, 'Loading face recognition model', true);

    const recogniser = new FaceRecogniser();
    if (!(await initRecogniserOrFail(recogniser, eventBus, jobId))) {return;}

    try {
        const insertStmt = db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES (?, ?, 'face_recognition', 'onnx_arcface_r50', '1.0', ?)
        `);

        for (const row of assets) {
            if (signal?.aborted) {
                console.log(`Job ${jobId} cancelled.`);
                eventBus.emit({
                    type: 'JobFailed',
                    jobId,
                    severity: 'warning',
                    reason: 'Cancelled by user'
                });
                emitRecognitionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, undefined, true);
                return;
            }
            await waitIfPaused(signal);
            try {
                const embeddings = await buildEmbeddings(recogniser, row, eventBus);
                db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(row.asset_id, 'face_recognition');
                insertStmt.run(uuidv4(), row.asset_id, JSON.stringify({ embeddings }));
                processed++;
                lastReportTime = emitRecognitionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, row.original_path);
            } catch (err: unknown) {
                const e = err as Error;
                console.error(`Error recognizing faces for ${row.asset_id}:`, e);
                errors++;
                processed++;
                lastReportTime = emitRecognitionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, row.original_path);
            }
        }

        emitRecognitionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, undefined, true);
        eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'recognition' });
    } catch (err: unknown) {
        const e = err as Error;
        eventBus.emit({
            type: 'JobFailed',
            jobId,
            severity: 'fatal',
            reason: `Recognition job crashed: ${e.message}`
        });
    }
}
