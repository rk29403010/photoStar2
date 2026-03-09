import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from './db';
import type { EventBus } from './events/bus';

interface WorkerContext {
    dbManager: DatabaseManager;
    eventBus: EventBus;
}

type AiMetadataQueueMode = 'fresh' | 'pro_pending' | 'all';

interface AiMetadataWorkerOptions {
    jobId?: string;
    queueMode: AiMetadataQueueMode;
    queueStage: string;
}

export async function runPreviewWorker(mediaIds: string[], context: WorkerContext) {
    const { runPreviewJob } = await import('./jobs/previews');
    await runPreviewJob(mediaIds, context.dbManager, context.eventBus);
}

export async function runFaceDetectionWorker(target: string[] | 'auto', context: WorkerContext) {
    const { runFaceDetectionJob } = await import('./jobs/detect_faces');
    await runFaceDetectionJob(target, context.dbManager, context.eventBus);
}

export async function runFaceRecognitionWorker(target: string[], context: WorkerContext) {
    const { runFaceRecognitionJob } = await import('./jobs/recognise_faces');
    await runFaceRecognitionJob(target, context.dbManager, context.eventBus);
}

export async function runFaceClusteringWorker(context: WorkerContext) {
    const { runFaceClusteringJob } = await import('./jobs/cluster_faces');
    await runFaceClusteringJob('cluster-sweep', context.dbManager, context.eventBus);
}

export async function runSensitiveScanWorker(target: string[] | 'auto', context: WorkerContext) {
    const { runSensitiveScanJob } = await import('./jobs/scan_sensitive');
    await runSensitiveScanJob(target, context.dbManager, context.eventBus);
}

export async function runComputeHashesWorker(context: WorkerContext) {
    const { runComputeHashesJob } = await import('./jobs/compute_hashes');
    await runComputeHashesJob('hash-sweep', context.dbManager, context.eventBus);
}

export async function runDuplicateGroupingWorker(context: WorkerContext) {
    const { runDuplicateGroupingJob } = await import('./jobs/build_duplicate_groups');
    await runDuplicateGroupingJob('dup-sweep', context.dbManager, context.eventBus);
}

export async function runVariantGroupingWorker(context: WorkerContext) {
    const { runVariantGroupingJob } = await import('./jobs/build_variant_groups');
    await runVariantGroupingJob('variant-sweep', context.dbManager, context.eventBus);
}

export async function runBurstGroupingWorker(jobId: string | undefined, context: WorkerContext) {
    const { runBurstGroupingJob } = await import('./jobs/build_burst_groups');
    await runBurstGroupingJob(jobId || uuidv4(), context.dbManager, context.eventBus);
}

export async function runAiMetadataWorker(
    target: string[] | 'auto',
    context: WorkerContext,
    options: AiMetadataWorkerOptions
) {
    const { runAiMetadataJob } = await import('./jobs/get_metadata_ai');
    await runAiMetadataJob(target, context.dbManager, context.eventBus, options.jobId, {
        queueMode: options.queueMode,
        queueStage: options.queueStage,
    });
}

export async function runAutoScanWorker(scanSessionId: string, folderPath: string, context: WorkerContext) {
    const { runScanJob } = await import('./jobs/scan');
    await runScanJob(scanSessionId, folderPath, context.dbManager, context.eventBus, new AbortController().signal);
}
