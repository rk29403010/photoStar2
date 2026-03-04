import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { DatabaseManager } from '../db';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';

const MODEL_FILENAME = 'det_10g.onnx';
let MODEL_PATH = join(path.dirname(process.execPath), 'models', MODEL_FILENAME);

if (!require('fs').existsSync(MODEL_PATH)) {
    MODEL_PATH = join(__dirname, '../../models', MODEL_FILENAME);
}

// RetinaFace / Buffalo_L Constants
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const STEPS = [8, 16, 32];
const MIN_SIZES = [[16, 32], [64, 128], [256, 512]];
const VARIANCE = [0.1, 0.2];

class FaceDetector {
    private session: ort.InferenceSession | null = null;
    private anchors: number[][] = [];

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
        this.generateAnchors();
    }

    private generateAnchors() {
        this.anchors = [];
        const featureMaps = STEPS.map(step => [Math.ceil(INPUT_HEIGHT / step), Math.ceil(INPUT_WIDTH / step)]);
        featureMaps.forEach((fmap, k) => {
            const minSizes = MIN_SIZES[k];
            for (let i = 0; i < fmap[0]; i++) {
                for (let j = 0; j < fmap[1]; j++) {
                    for (const minSize of minSizes) {
                        const s_kx = minSize / INPUT_WIDTH;
                        const s_ky = minSize / INPUT_HEIGHT;
                        const dense_cx = (j + 0.5) * STEPS[k] / INPUT_WIDTH;
                        const dense_cy = (i + 0.5) * STEPS[k] / INPUT_HEIGHT;
                        this.anchors.push([dense_cx, dense_cy, s_kx, s_ky]);
                    }
                }
            }
        });
    }

    async detect(imagePath: string): Promise<any[]> {
        if (!this.session) throw new Error('Model not loaded');
        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const { width: origW, height: origH } = metadata;
        if (!origW || !origH) throw new Error('Bad image');

        const buffer = await image
            .resize(INPUT_WIDTH, INPUT_HEIGHT, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer();

        const float32Data = new Float32Array(3 * INPUT_HEIGHT * INPUT_WIDTH);
        for (let i = 0; i < INPUT_HEIGHT * INPUT_WIDTH; i++) {
            float32Data[i] = (buffer[i * 3] - 127.5) / 128.0;
            float32Data[i + INPUT_HEIGHT * INPUT_WIDTH] = (buffer[i * 3 + 1] - 127.5) / 128.0;
            float32Data[i + 2 * INPUT_HEIGHT * INPUT_WIDTH] = (buffer[i * 3 + 2] - 127.5) / 128.0;
        }

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
        const results = await this.session.run({ 'input.1': tensor });

        try {
            const scores = Float32Array.from([
                ...(results['448'].data as Float32Array),
                ...(results['471'].data as Float32Array),
                ...(results['494'].data as Float32Array)
            ]);
            const boxes = Float32Array.from([
                ...(results['451'].data as Float32Array),
                ...(results['474'].data as Float32Array),
                ...(results['497'].data as Float32Array)
            ]);
            const landmarks = Float32Array.from([
                ...(results['454'].data as Float32Array),
                ...(results['477'].data as Float32Array),
                ...(results['500'].data as Float32Array)
            ]);

            return this.postProcess(scores, boxes, landmarks, origW, origH);
        } catch (e) {
            return [];
        }
    }

    private postProcess(scores: Float32Array, boxes: Float32Array, landmarks: Float32Array, origW: number, origH: number) {
        const threshold = 0.5;
        const candidates: any[] = [];
        for (let i = 0; i < this.anchors.length; i++) {
            const score = scores[i];
            if (score > threshold) {
                const anchor = this.anchors[i];
                const dx = boxes[i * 4];
                const dy = boxes[i * 4 + 1];
                const dw = boxes[i * 4 + 2];
                const dh = boxes[i * 4 + 3];

                const cx = anchor[0] + dx * VARIANCE[0] * anchor[2];
                const cy = anchor[1] + dy * VARIANCE[0] * anchor[3];
                const w = anchor[2] * Math.exp(dw * VARIANCE[1]);
                const h = anchor[3] * Math.exp(dh * VARIANCE[1]);

                const x1 = cx - w / 2;
                const y1 = cy - h / 2;
                const x2 = cx + w / 2;
                const y2 = cy + h / 2;

                const land = [];
                for (let k = 0; k < 5; k++) {
                    const ldx = landmarks[i * 10 + k * 2];
                    const ldy = landmarks[i * 10 + k * 2 + 1];
                    const lx = anchor[0] + ldx * VARIANCE[0] * anchor[2];
                    const ly = anchor[1] + ldy * VARIANCE[0] * anchor[3];
                    land.push({ x: lx, y: ly });
                }

                candidates.push({
                    score,
                    box: [
                        Math.max(0, Math.min(1, x1)),
                        Math.max(0, Math.min(1, y1)),
                        Math.max(0, Math.min(1, x2)),
                        Math.max(0, Math.min(1, y2))
                    ],
                    landmarks: land
                });
            }
        }
        return this.nms(candidates);
    }

    private nms(candidates: any[]) {
        candidates.sort((a, b) => b.score - a.score);
        const kept: any[] = [];
        while (candidates.length > 0) {
            const best = candidates.shift();
            kept.push(best);
            for (let i = candidates.length - 1; i >= 0; i--) {
                if (this.iou(best.box, candidates[i].box) > 0.4) {
                    candidates.splice(i, 1);
                }
            }
        }
        return kept;
    }

    private iou(boxA: number[], boxB: number[]) {
        const xA = Math.max(boxA[0], boxB[0]);
        const yA = Math.max(boxA[1], boxB[1]);
        const xB = Math.min(boxA[2], boxB[2]);
        const yB = Math.min(boxA[3], boxB[3]);
        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
        const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
        return interArea / (boxAArea + boxBArea - interArea);
    }
}

export async function runFaceDetectionJob(
    targetInput: string | string[],
    dbManager: DatabaseManager,
    eventBus: EventBus
) {
    const db = dbManager.getDb();

    // Determine scope
    let assets: any[] = [];

    if (Array.isArray(targetInput) && targetInput.length > 0) {
        // Optimised batch fetch
        const placeholders = targetInput.map(() => '?').join(',');
        assets = db.prepare(`SELECT id, original_path FROM assets WHERE id IN (${placeholders})`).all(...targetInput) as any[];
    } else if (typeof targetInput === 'string' && !targetInput.startsWith('job-')) {
        // Single ID
        assets = db.prepare('SELECT id, original_path FROM assets WHERE id = ?').all(targetInput) as any[];
    } else {
        // Fallback or "Scanning" mode - find all pending
        assets = db.prepare(`
            SELECT id, original_path 
            FROM assets 
            WHERE id NOT IN (
                SELECT asset_id FROM derived_results WHERE task = 'face_detection'
            )
        `).all() as any[];
    }

    if (assets.length === 0) return;

    const detector = new FaceDetector();
    try {
        await detector.init();
    } catch (e: any) {
        console.error('Failed to init detector', e);
        return;
    }

    const jobId = `detect-batch-${Date.now()}`;
    const totalItems = assets.length;
    let processed = 0;
    let errors = 0;
    const startTime = Date.now();
    let lastReportTime = startTime;

    eventBus.emit({
        type: 'JobStarted',
        jobId: jobId,
        pipelineStage: 'detection'
    });

    const reportProgress = (currentItemPath?: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastReportTime < 500) return;

        const elapsedSec = (now - startTime) / 1000;
        const throughputIps = elapsedSec > 0 ? processed / elapsedSec : 0;

        eventBus.emit({
            type: 'JobProgress',
            jobId: jobId,
            processedItems: processed,
            totalItems,
            currentItemPath,
            throughputIps,
            errorCount: errors
        });

        lastReportTime = now;
    };

    const insertStmt = db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'face_detection', 'onnx_retina_10g', '1.0', ?)
    `);

    for (const asset of assets) {
        await waitIfPaused();
        // Run synchronously-ish
        try {
            const faces = await detector.detect(asset.original_path);

            const resultData = JSON.stringify({
                faces: faces.map(f => ({
                    id: uuidv4(), // Assign ID to each face
                    box: f.box,
                    score: f.score,
                    landmarks: f.landmarks
                }))
            });

            db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(asset.id, 'face_detection');
            insertStmt.run(uuidv4(), asset.id, resultData);

            eventBus.emit({
                type: 'FacesDetected',
                mediaId: asset.id,
                faceCount: faces.length
            });

            processed++;
            reportProgress(asset.original_path);

        } catch (e: any) {
            console.error(`Error detecting faces for ${asset.original_path}:`, e);
            errors++;

            try {
                db.prepare(`
                    INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
                    VALUES (?, ?, ?, 'detection', 'fatal', ?)
                `).run(uuidv4(), asset.id, jobId, e.message);
            } catch (dbErr) {
                console.error('Failed to log processing issue:', dbErr);
            }

            eventBus.emit({
                type: 'JobFailed',
                jobId: 'detection-' + asset.id,
                severity: 'warning',
                reason: e.message
            });
            processed++;
            reportProgress();
        }
    }

    reportProgress(undefined, true);
    eventBus.emit({
        type: 'JobCompleted',
        jobId: jobId,
        pipelineStage: 'detection'
    });
}
