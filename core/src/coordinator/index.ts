import { EventBus } from '../events/bus';
import { DomainEvent } from '../events/types';
import { DatabaseManager } from '../db';
import { SystemState } from '../state';

export class Coordinator {
    private eventBus: EventBus;
    private db: DatabaseManager;

    private evaluateQueueTimeout: NodeJS.Timeout | null = null;
    private isEvaluating = false;
    private aiJobSightingTimes: Record<string, number> = {};

    constructor(eventBus: EventBus, db: DatabaseManager) {
        this.eventBus = eventBus;
        this.db = db;
        this.registerReactors();

        // Kick off evaluation on boot to resume interrupted tasks
        this.triggerEvaluateQueue();
    }

    // Public method to manually trigger evaluation when resumed
    public forceEvaluate() {
        this.triggerEvaluateQueue(true);
    }

    private registerReactors() {
        this.eventBus.subscribe('MediaDiscovered', this.onMediaDiscovered.bind(this));

        // Progression triggers
        this.eventBus.subscribe('PreviewGenerated', this.onPreviewGenerated.bind(this));
        this.eventBus.subscribe('FacesDetected', this.onFacesDetected.bind(this));
        this.eventBus.subscribe('FaceEmbeddingGenerated', this.onFaceEmbeddingGenerated.bind(this));
        this.eventBus.subscribe('SensitivityScored', this.onSensitivityScored.bind(this));

        // Worker completion unblocks the queue
        this.eventBus.subscribe('JobCompleted', this.onJobCompleted.bind(this));
        this.eventBus.subscribe('JobFailed', this.onJobCompleted.bind(this));
    }

    private triggerEvaluateQueue(immediate: boolean = false) {
        if (this.evaluateQueueTimeout) {
            clearTimeout(this.evaluateQueueTimeout);
            this.evaluateQueueTimeout = null;
        }
        if (immediate) {
            this.evaluateQueue();
            return;
        }
        this.evaluateQueueTimeout = setTimeout(() => {
            this.evaluateQueueTimeout = null;
            this.evaluateQueue();
        }, 500); // Debounce to prevent hammering DB on burst events
    }

    // --- Enqueueing Workflows ---

    private onMediaDiscovered(event: DomainEvent) {
        if (event.type !== 'MediaDiscovered') return;
        this.db.getDb().prepare(`INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage) VALUES (?, 'previews')`).run(event.mediaId);
        this.triggerEvaluateQueue();
    }

    private onPreviewGenerated(event: DomainEvent) {
        if (event.type !== 'PreviewGenerated') return;
        this.db.getDb().transaction(() => {
            this.db.getDb().prepare(`UPDATE task_queue SET status = 'completed' WHERE media_id = ? AND pipeline_stage = 'previews'`).run(event.mediaId);
            this.db.getDb().prepare(`INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage) VALUES (?, 'detection')`).run(event.mediaId);
            // Queue sensitivity scan as a low-priority background task
            this.db.getDb().prepare(`INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage, priority) VALUES (?, 'sensitive_scan', -10)`).run(event.mediaId);
        })();
        this.triggerEvaluateQueue();
    }

    private onFacesDetected(event: DomainEvent) {
        if (event.type !== 'FacesDetected') return;
        this.db.getDb().transaction(() => {
            this.db.getDb().prepare(`UPDATE task_queue SET status = 'completed' WHERE media_id = ? AND pipeline_stage = 'detection'`).run(event.mediaId);
            if (event.faceCount > 0) {
                this.db.getDb().prepare(`INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage) VALUES (?, 'recognition')`).run(event.mediaId);
            }
        })();
        this.triggerEvaluateQueue();
    }

    private onFaceEmbeddingGenerated(event: DomainEvent) {
        if (event.type !== 'FaceEmbeddingGenerated') return;
        // Mark recognition completed per face. Since we dispatch per image batch, it's safe to mark the 'recognition' item completed upon the first face's embedding (or all, the UPDATE is idempotent)
        this.db.getDb().transaction(() => {
            this.db.getDb().prepare(`UPDATE task_queue SET status = 'completed' WHERE media_id = ? AND pipeline_stage = 'recognition'`).run(event.mediaId);
            this.db.getDb().prepare(`INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage) VALUES (?, 'clustering')`).run(event.mediaId);
        })();
        this.triggerEvaluateQueue();
    }

    private onSensitivityScored(event: DomainEvent) {
        if (event.type !== 'SensitivityScored') return;
        this.db.getDb().prepare(
            `UPDATE task_queue SET status = 'completed' WHERE media_id = ? AND pipeline_stage = 'sensitive_scan'`
        ).run(event.mediaId);
    }

    private onJobCompleted(event: DomainEvent) {
        if (event.type === 'JobCompleted' && event.pipelineStage === 'previews') {
            this.triggerEvaluateQueue(true);
            return;
        }

        // When recognition finishes, clean up any stuck 'processing' rows.
        // These happen for images where FaceEmbeddingGenerated was never emitted
        // (e.g. no detectable faces, landmark failure). Without this sweep they
        // permanently block evaluateQueue from ever reaching the clustering stage.
        if (event.type === 'JobCompleted' && event.pipelineStage === 'recognition') {
            this.db.getDb().transaction(() => {
                // Mark any remaining 'processing' recognition rows as completed
                const stuck = this.db.getDb().prepare(
                    `UPDATE task_queue SET status = 'completed' WHERE pipeline_stage = 'recognition' AND status = 'processing'`
                ).run();

                if (stuck.changes > 0) {
                    console.error(`[Coordinator] Cleaned up ${stuck.changes} stuck recognition task(s).`);
                }

                // Ensure at least one clustering row exists so evaluateQueue picks it up.
                // Use the first asset that has recognition data as the trigger row.
                const anyAsset = this.db.getDb().prepare(
                    `SELECT asset_id FROM derived_results WHERE task = 'face_recognition' LIMIT 1`
                ).get() as { asset_id: string } | undefined;

                if (anyAsset) {
                    this.db.getDb().prepare(
                        `INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage) VALUES (?, 'clustering')`
                    ).run(anyAsset.asset_id);
                }
            })();
        }

        this.triggerEvaluateQueue();
    }

    // --- Smart Evaluation Loop ---

    private evaluateQueue() {
        if (this.isEvaluating || SystemState.isPaused) return;
        this.isEvaluating = true;
        try {
            // 1. High-Priority Jump (Single Photo View)
            const highPriorityRows = this.db.getDb().prepare(`
                SELECT media_id, pipeline_stage 
                FROM task_queue
                WHERE status = 'pending' AND priority > 0
                ORDER BY priority DESC, created_at ASC
                LIMIT 50
            `).all() as { media_id: string, pipeline_stage: string }[];

            if (highPriorityRows.length > 0) {
                this.dispatchTasks(highPriorityRows);
                return; // Return early, let high-priority finish before touching bulk
            }

            // 2. Strict Bulk Processing Sequence
            // A. Previews (Highest Bulk Priority)
            const activePreviews = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status IN ('pending', 'processing') AND pipeline_stage = 'previews'`).get() as { count: number };
            if (activePreviews.count > 0) {
                const pendingBatch = this.db.getDb().prepare(`
                    SELECT media_id, pipeline_stage FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'previews' ORDER BY created_at ASC LIMIT 100
                `).all() as { media_id: string, pipeline_stage: string }[];
                if (pendingBatch.length > 0) this.dispatchTasks(pendingBatch);
                return; // BLOCK AI STAGES WHILE PREVIEWS PEND OR PROCESS
            }

            // B. Face Detection (Heavy Task)
            const activeDetection = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status IN ('pending', 'processing') AND pipeline_stage = 'detection'`).get() as { count: number };
            if (activeDetection.count > 0) {
                const pendingDetectionCount = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'detection'`).get() as { count: number };
                if (pendingDetectionCount.count > 0 && this.shouldTriggerHeavyTask('detection', pendingDetectionCount.count)) {
                    const batch = this.db.getDb().prepare(`
                        SELECT media_id, pipeline_stage FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'detection' ORDER BY created_at ASC LIMIT 100
                    `).all() as { media_id: string, pipeline_stage: string }[];
                    this.dispatchTasks(batch);
                }
                return; // BLOCK RECOGNITION WHILE DETECTION PENDS OR PROCESSES
            } else {
                delete this.aiJobSightingTimes['detection'];
            }

            // C. Face Recognition (Heavy Task)
            const activeRecognition = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status IN ('pending', 'processing') AND pipeline_stage = 'recognition'`).get() as { count: number };
            if (activeRecognition.count > 0) {
                const pendingRecognitionCount = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'recognition'`).get() as { count: number };
                if (pendingRecognitionCount.count > 0 && this.shouldTriggerHeavyTask('recognition', pendingRecognitionCount.count)) {
                    const batch = this.db.getDb().prepare(`
                        SELECT media_id, pipeline_stage FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'recognition' ORDER BY created_at ASC LIMIT 100
                    `).all() as { media_id: string, pipeline_stage: string }[];
                    this.dispatchTasks(batch);
                }
                return; // BLOCK CLUSTERING
            } else {
                delete this.aiJobSightingTimes['recognition'];
            }

            // D. Clustering
            const activeClustering = this.db.getDb().prepare(`SELECT count(*) as count FROM jobs WHERE id LIKE 'cluster-%' AND status = 'running'`).get() as { count: number };
            if (activeClustering.count === 0) {
                const pendingClustering = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'clustering'`).get() as { count: number };
                if (pendingClustering.count > 0) {
                    this.db.getDb().prepare(`UPDATE task_queue SET status = 'completed' WHERE pipeline_stage = 'clustering'`).run();
                    this.eventBus.emit({ type: 'FaceClusteringRequested' });
                }
            }

            // E. Sensitive Scan – low priority, runs when nothing else is active
            const activeSensitive = this.db.getDb().prepare(`SELECT count(*) as count FROM jobs WHERE id LIKE 'sensitive-%' AND status = 'running'`).get() as { count: number };
            if (activeSensitive.count === 0) {
                const pendingSensitive = this.db.getDb().prepare(`SELECT count(*) as count FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'sensitive_scan'`).get() as { count: number };
                if (pendingSensitive.count > 0 && this.shouldTriggerHeavyTask('sensitive_scan', pendingSensitive.count)) {
                    const batch = this.db.getDb().prepare(`
                        SELECT media_id, pipeline_stage FROM task_queue WHERE status = 'pending' AND pipeline_stage = 'sensitive_scan' ORDER BY created_at ASC LIMIT 200
                    `).all() as { media_id: string, pipeline_stage: string }[];
                    this.dispatchTasks(batch);
                }
            }

        } finally {
            this.isEvaluating = false;
        }
    }

    private shouldTriggerHeavyTask(stage: string, count: number): boolean {
        const BATCH_THRESHOLD = 5;  // Spin up model when ≥5 items queued
        const MAX_WAIT_MS = 20000;  // OR if 20s have passed since the first item appeared

        if (count >= BATCH_THRESHOLD) return true;

        const now = Date.now();
        if (!this.aiJobSightingTimes[stage]) {
            this.aiJobSightingTimes[stage] = now;
            return false;
        }

        if (now - this.aiJobSightingTimes[stage] >= MAX_WAIT_MS) {
            return true;
        }

        return false;
    }

    private dispatchTasks(rows: { media_id: string, pipeline_stage: string }[]) {
        if (rows.length === 0) return;

        const mediaIdsByStage: Record<string, string[]> = {};

        // Mark as processing atomically
        const stmt = this.db.getDb().prepare(`UPDATE task_queue SET status = 'processing' WHERE media_id = ? AND pipeline_stage = ?`);
        this.db.getDb().transaction(() => {
            for (const row of rows) {
                stmt.run(row.media_id, row.pipeline_stage);
                if (!mediaIdsByStage[row.pipeline_stage]) mediaIdsByStage[row.pipeline_stage] = [];
                mediaIdsByStage[row.pipeline_stage].push(row.media_id);
            }
        })();

        // Dispatch requests to main.ts orchestrator logic
        if (mediaIdsByStage['previews']) {
            this.eventBus.emit({
                type: 'PreviewRequested',
                mediaIds: mediaIdsByStage['previews'],
                reason: 'ingest'
            });
        }
        if (mediaIdsByStage['detection']) {
            this.eventBus.emit({
                type: 'FaceDetectionRequested',
                mediaIds: mediaIdsByStage['detection']
            });
        }
        if (mediaIdsByStage['recognition']) {
            this.eventBus.emit({
                type: 'FaceRecognitionRequested',
                mediaIds: mediaIdsByStage['recognition']
            });
        }
        if (mediaIdsByStage['sensitive_scan']) {
            this.eventBus.emit({
                type: 'SensitiveScanRequested',
                mediaIds: mediaIdsByStage['sensitive_scan']
            } as any);
        }
    }
}
