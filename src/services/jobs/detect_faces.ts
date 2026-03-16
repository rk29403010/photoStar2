import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { DatabaseManager } from '../../data/db';
import type { EventBus } from '../events/bus';
import { resolveOnnxModelPath } from '../modelPaths';
import { waitIfPaused } from '../state';

const MODEL_FILENAME = 'det_10g.onnx';
const MODEL_PATH = resolveOnnxModelPath({
    modelFileName: MODEL_FILENAME,
    moduleDir: __dirname,
});

// RetinaFace / Buffalo_L Constants
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const STEPS = [8, 16, 32];
const MIN_SIZES = [[16, 32], [64, 128], [256, 512]];
const VARIANCE = [0.1, 0.2];

export interface FaceDetectionCandidate {
    score: number;
    box: [number, number, number, number]; // [x1, y1, x2, y2] normalized
    landmarks: { x: number; y: number }[];
}

class FaceDetector {
    private session: ort.InferenceSession | null = null;
    private anchors: number[][] = [];

    async init() {
        if (this.session) {return;}
        let usableModelPath = MODEL_PATH;
        if (MODEL_PATH.includes('snapshot')) {
            const tmpDir = tmpdir();
            const tmpPath = join(tmpDir, MODEL_FILENAME);
            if (!existsSync(tmpPath)) {
                mkdirSync(dirname(tmpPath), { recursive: true }); // Ensure directory exists
                copyFileSync(MODEL_PATH, tmpPath);
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

    async detect(imagePath: string): Promise<FaceDetectionCandidate[]> {
        if (!this.session) {throw new Error('Model not loaded');}
        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const { width: origW, height: origH } = metadata;
        if (!origW || !origH) {throw new Error('Bad image');}

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

            return this.postProcess(scores, boxes, landmarks);
        } catch {
            return [];
        }
    }

    private postProcess(scores: Float32Array, boxes: Float32Array, landmarks: Float32Array): FaceDetectionCandidate[] {
        const threshold = 0.5;
        const candidates: FaceDetectionCandidate[] = [];
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

    private nms(candidates: FaceDetectionCandidate[]): FaceDetectionCandidate[] {
        candidates.sort((a, b) => b.score - a.score);
        const kept: FaceDetectionCandidate[] = [];
        while (candidates.length > 0) {
            const best = candidates.shift();
            if (!best) {break;}
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

type DetectionAsset = { id: string; original_path: string };

function resolveDetectionAssets(
    db: ReturnType<DatabaseManager['getDb']>,
    targetInput: string | string[]
): DetectionAsset[] {
    if (Array.isArray(targetInput) && targetInput.length > 0) {
        const placeholders = targetInput.map(() => '?').join(',');
        return db.prepare(`SELECT id, original_path FROM assets WHERE id IN(${placeholders})`).all(...targetInput) as DetectionAsset[];
    }

    if (typeof targetInput === 'string' && !targetInput.startsWith('job-') && !targetInput.startsWith('auto')) {
        return db.prepare('SELECT id, original_path FROM assets WHERE id = ?').all(targetInput) as DetectionAsset[];
    }

    return db.prepare(`
        SELECT id, original_path 
        FROM assets 
        WHERE id NOT IN(SELECT asset_id FROM derived_results WHERE task = 'face_detection')
    `).all() as DetectionAsset[];
}

function emitDetectionProgress(
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

async function initDetectorOrFail(detector: FaceDetector, eventBus: EventBus, jobId: string): Promise<boolean> {
    try {
        await detector.init();
        return true;
    } catch (err: unknown) {
        const e = err as Error;
        console.error('Failed to init detector', e);
        eventBus.emit({
            type: 'JobFailed',
            jobId,
            severity: 'fatal',
            reason: `Detector init failed: ${e.message}`
        });
        return false;
    }
}

async function processDetectionAsset(
    db: ReturnType<DatabaseManager['getDb']>,
    asset: DetectionAsset,
    detector: FaceDetector,
    jobId: string,
    eventBus: EventBus
): Promise<{ errors: number; currentPath?: string }> {
    try {
        const faces = await detector.detect(asset.original_path);
        const resultData = JSON.stringify({
            faces: faces.map(f => ({ id: uuidv4(), box: f.box, score: f.score, landmarks: f.landmarks }))
        });

        db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(asset.id, 'face_detection');
        db.prepare(`
            INSERT INTO derived_results(id, asset_id, task, provider, model_version, data)
            VALUES(?, ?, 'face_detection', 'onnx_retina_10g', '1.0', ?)
        `).run(uuidv4(), asset.id, resultData);

        eventBus.emit({ type: 'FacesDetected', mediaId: asset.id, faceCount: faces.length, source: 'legacy_pipeline' });
        return { errors: 0, currentPath: asset.original_path };
    } catch (err: unknown) {
        const e = err as Error;
        console.error(`Error detecting faces for ${asset.original_path}: `, e);
        try {
            db.prepare(`
                INSERT INTO processing_issues(id, asset_id, job_id, task, severity, message)
                VALUES(?, ?, ?, 'detection', 'fatal', ?)
            `).run(uuidv4(), asset.id, jobId, e.message);
        } catch (dbErr) {
            console.error('Failed to log processing issue:', dbErr);
        }
        eventBus.emit({ type: 'JobFailed', jobId: `detection-${asset.id}`, severity: 'warning', reason: e.message });
        return { errors: 1 };
    }
}

export async function runFaceDetectionJob(
    targetInput: string | string[],
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal,
    uiJobId?: string
) {
    const db = dbManager.getDb();
    const assets = resolveDetectionAssets(db, targetInput);
    const generatedJobId = targetInput === 'auto' ? `detect-auto-${Date.now()}` : `detect-batch-${Date.now()}`;
    const jobId = uiJobId || generatedJobId;

    if (assets.length === 0) {
        if (uiJobId) {
            eventBus.emit({ type: 'JobStarted', jobId, pipelineStage: 'detection', totalItems: 0 });
            eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'detection' });
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
        pipelineStage: 'detection',
        totalItems
    });

    lastReportTime = emitDetectionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, 'Loading face detector model', true);

    const detector = new FaceDetector();
    if (!(await initDetectorOrFail(detector, eventBus, jobId))) {return;}

    try {
        for (const asset of assets) {
            if (signal?.aborted) {
                console.log(`Job ${jobId} cancelled.`);
                eventBus.emit({
                    type: 'JobFailed',
                    jobId,
                    severity: 'warning',
                    reason: 'Cancelled by user'
                });
                emitDetectionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, undefined, true);
                return;
            }
            await waitIfPaused(signal);
            const outcome = await processDetectionAsset(db, asset, detector, jobId, eventBus);
            processed++;
            errors += outcome.errors;
            lastReportTime = emitDetectionProgress(
                eventBus,
                jobId,
                processed,
                totalItems,
                errors,
                startTime,
                lastReportTime,
                outcome.currentPath
            );
        }

        emitDetectionProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, undefined, true);
        eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'detection' });
    } catch (err: unknown) {
        const e = err as Error;
        eventBus.emit({
            type: 'JobFailed',
            jobId,
            severity: 'fatal',
            reason: `Detection job crashed: ${e.message}`
        });
    }
}
