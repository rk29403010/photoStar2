import { EventBus } from '../events/bus';
import { DomainEvent } from '../events/types';
import { DatabaseManager } from '../db';

// Simple in-memory task queue for now
// In a real system this might be Redis or a proper job queue
type QueuedTask = {
    id: string;
    type: string;
    payload: any;
    retries: number;
};

export class Coordinator {
    private eventBus: EventBus;
    private db: DatabaseManager;
    private taskQueue: QueuedTask[] = [];
    private isProcessing = false;

    private ingestPhase: 'fast' | 'slow' = 'fast';

    // Batching buffers
    private previewBatch: string[] = [];
    private previewBatchTimeout: NodeJS.Timeout | null = null;

    constructor(eventBus: EventBus, db: DatabaseManager) {
        this.eventBus = eventBus;
        this.db = db;
        this.registerReactors();
    }

    private registerReactors() {
        // Broad reactor to all events to check for triggers
        this.eventBus.subscribeAll(this.handleEvent.bind(this));

        // Specific reactors for batching logic
        this.eventBus.subscribe('MediaDiscovered', this.onMediaDiscovered.bind(this));
        this.eventBus.subscribe('PreviewGenerated', this.onPreviewGenerated.bind(this));
        this.eventBus.subscribe('FacesDetected', this.onFacesDetected.bind(this));
        this.eventBus.subscribe('FaceEmbeddingGenerated', this.onFaceEmbeddingGenerated.bind(this));
        this.eventBus.subscribe('FaceMatched', this.onFaceMatched.bind(this));
        this.eventBus.subscribe('JobCompleted', this.onJobCompleted.bind(this));
    }

    private handleEvent(event: DomainEvent) {
        // General logging or reaction logic could go here
        // console.log(`[Coordinator] Saw event: ${event.type}`);
    }

    // --- Workflows ---

    // 1. Ingest -> Preview
    private onMediaDiscovered(event: DomainEvent) {
        if (event.type !== 'MediaDiscovered') return;

        console.log(`[Coordinator] MediaDiscovered: ${event.mediaId}`); // DEBUG LOG

        // Always add to batch for preview generation (Phase 1)
        this.previewBatch.push(event.mediaId);

        // Debounce the flush
        if (this.previewBatchTimeout) {
            clearTimeout(this.previewBatchTimeout);
        }

        this.previewBatchTimeout = setTimeout(() => {
            this.flushPreviewBatch();
        }, 500); // Wait 500ms to collect more

        // Phase 2: Face Detection
        // Only if we are already in slow phase.
        if (this.ingestPhase === 'slow') {
            this.faceBatch.push(event.mediaId);
            if (this.faceBatchTimeout) clearTimeout(this.faceBatchTimeout);
            this.faceBatchTimeout = setTimeout(() => this.flushFaceBatch(), 2000); // 2s batch for faces
        }
    }

    private onJobCompleted(event: DomainEvent) {
        if (event.type !== 'JobCompleted') return;

        // If a scan job finished, we can transition to slow phase
        // We assume ANY scan finishing means we are "stable" enough to start crunching.
        // In a complex system with multiple scans, we might check if ALL scans are done.
        // For now: transition to slow.

        // Simplification: If we are 'fast', and we get a completion, we *try* to switch to slow.
        // If there are other active scans, we might want to wait?
        // Let's just switch to slow on first scan completion.

        if (this.ingestPhase === 'fast') {
            console.log(`[Coordinator] Job ${event.jobId} completed. potential transition to SLOW phase.`);
            // TODO: verify it was a scan?
            this.ingestPhase = 'slow';
            this.processBacklog();
        }
    }

    private processBacklog() {
        console.log('[Coordinator] Phase transition: FAST -> SLOW. Processing backlog.');
        // Trigger a general background face detection sweep
        this.eventBus.emit({
            type: 'FaceDetectionRequested'
        });
    }

    private faceBatch: string[] = [];
    private faceBatchTimeout: NodeJS.Timeout | null = null;

    private flushFaceBatch() {
        if (this.faceBatch.length === 0) return;
        const mediaIds = [...this.faceBatch];
        this.faceBatch = [];
        this.eventBus.emit({
            type: 'FaceDetectionRequested',
            mediaIds: mediaIds
        });
    }

    // 2. Preview Batching
    private flushPreviewBatch() {
        if (this.previewBatch.length === 0) return;

        const mediaIds = [...this.previewBatch];
        this.previewBatch = [];
        this.previewBatchTimeout = null;

        console.log(`[Coordinator] Requesting previews for ${mediaIds.length} items`);

        this.eventBus.emit({
            type: 'PreviewRequested',
            mediaIds: mediaIds,
            reason: 'ingest'
        });
    }

    // 3. Face Analysis Chain
    // Detect -> Embed -> Match -> Cluster

    private onPreviewGenerated(event: DomainEvent) {
        // No-op for now
    }

    private onFacesDetected(event: DomainEvent) {
        if (event.type !== 'FacesDetected') return;

        if (event.faceCount > 0) {
            // ... (existing logic)
        }
    }

    private onFaceEmbeddingGenerated(event: DomainEvent) {
        if (event.type !== 'FaceEmbeddingGenerated') return;
        // Trigger Match
    }

    private onFaceMatched(event: DomainEvent) {
        if (event.type !== 'FaceMatched') return;
        // Trigger Cluster Update?
        this.eventBus.emit({
            type: 'FaceClusteringUpdated',
            clusterId: 'global' // simplified
        });
    }

}
