
import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { DatabaseManager } from '../db';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../events/bus';

const MODEL_FILENAME = 'w600k_r50.onnx';
let MODEL_PATH = join(path.dirname(process.execPath), 'models', MODEL_FILENAME);

if (!require('fs').existsSync(MODEL_PATH)) {
    MODEL_PATH = join(__dirname, '../../models', MODEL_FILENAME);
}

class FaceRecogniser {
    private session: ort.InferenceSession | null = null;

    async init() {
        if (this.session) return;
        let usableModelPath = MODEL_PATH;
        if (MODEL_PATH.includes('snapshot')) {
            const tmpDir = require('os').tmpdir();
            const tmpPath = join(tmpDir, MODEL_FILENAME);
            if (!require('fs').existsSync(tmpPath)) {
                require('fs').copyFileSync(MODEL_PATH, tmpPath);
            }
            usableModelPath = tmpPath;
        }
        const options: ort.InferenceSession.SessionOptions = { logSeverityLevel: 3 };
        this.session = await ort.InferenceSession.create(usableModelPath, options);
    }

    async computeEmbedding(imagePath: string, box: number[], landmarks: { x: number, y: number }[]): Promise<number[] | null> {
        if (!this.session) throw new Error('Model not loaded');

        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const iw = metadata.width || 0;
        const ih = metadata.height || 0;

        let x1 = box[0] * iw;
        let y1 = box[1] * ih;
        let x2 = box[2] * iw;
        let y2 = box[3] * ih;

        let bw = x2 - x1;
        let bh = y2 - y1;
        const cx = x1 + bw / 2;
        const cy = y1 + bh / 2;
        const size = Math.max(bw, bh) * 1.3;

        x1 = Math.max(0, cx - size / 2);
        y1 = Math.max(0, cy - size / 2);
        bw = size;
        bh = size;

        if (x1 + bw > iw) bw = iw - x1;
        if (y1 + bh > ih) bh = ih - y1;

        const buffer = await image
            .extract({ left: Math.round(x1), top: Math.round(y1), width: Math.round(bw), height: Math.round(bh) })
            .resize(112, 112, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer();

        const float32Data = new Float32Array(3 * 112 * 112);
        for (let i = 0; i < 112 * 112; i++) {
            float32Data[i] = (buffer[i * 3] - 127.5) / 128.0;
            float32Data[i + 112 * 112] = (buffer[i * 3 + 1] - 127.5) / 128.0;
            float32Data[i + 2 * 112 * 112] = (buffer[i * 3 + 2] - 127.5) / 128.0;
        }

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, 112, 112]);
        const results = await this.session.run({ 'input.1': tensor });
        const outputKey = Object.keys(results)[0];
        const embedding = results[outputKey].data as Float32Array;

        return Array.from(embedding);
    }
}

export async function runFaceRecognitionJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus
) {
    const db = dbManager.getDb();

    // Find assets with detection but no recognition
    const assets = db.prepare(`
        SELECT d.asset_id, d.data, a.original_path 
        FROM derived_results d
        JOIN assets a ON a.id = d.asset_id
        WHERE d.task = 'face_detection'
        AND d.asset_id NOT IN (
            SELECT asset_id FROM derived_results WHERE task = 'face_recognition'
        )
    `).all() as any[];

    if (assets.length === 0) return;

    const recogniser = new FaceRecogniser();
    await recogniser.init();

    const insertStmt = db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'face_recognition', 'onnx_arcface_r50', '1.0', ?)
    `);

    const activeJobId = `recog-batch-${Date.now()}`;
    const totalItems = assets.length;
    let processed = 0;
    let errors = 0;
    const startTime = Date.now();
    let lastReportTime = startTime;

    eventBus.emit({
        type: 'JobStarted',
        jobId: activeJobId,
        pipelineStage: 'recognition'
    });

    const reportProgress = (currentItemPath?: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastReportTime < 500) return;

        const elapsedSec = (now - startTime) / 1000;
        const throughputIps = elapsedSec > 0 ? processed / elapsedSec : 0;

        eventBus.emit({
            type: 'JobProgress',
            jobId: activeJobId,
            processedItems: processed,
            totalItems,
            currentItemPath,
            throughputIps,
            errorCount: errors
        });

        lastReportTime = now;
    };

    for (const row of assets) {
        try {
            const detectionData = JSON.parse(row.data);
            const faces = detectionData.faces || [];

            // Should contain 'id' now from updated detect_faces

            const embeddings = [];

            for (const face of faces) {
                if (face.box && face.landmarks) {
                    try {
                        const emb = await recogniser.computeEmbedding(row.original_path, face.box, face.landmarks);
                        embeddings.push(emb);

                        if (emb && face.id) {
                            eventBus.emit({
                                type: 'FaceEmbeddingGenerated',
                                mediaId: row.asset_id,
                                faceId: face.id
                            });
                        }
                    } catch (e) {
                        console.error('Recog error:', e);
                        embeddings.push(null);
                    }
                } else {
                    embeddings.push(null);
                }
            }

            insertStmt.run(uuidv4(), row.asset_id, JSON.stringify({ embeddings }));
            processed++;
            reportProgress(row.original_path);
        } catch (e: any) {
            console.error(`Error recognizing faces for ${row.asset_id}:`, e);
            errors++;
            processed++;
            reportProgress(row.original_path);
        }
    }

    reportProgress(undefined, true);
    eventBus.emit({
        type: 'JobCompleted',
        jobId: activeJobId,
        pipelineStage: 'recognition'
    });
}
