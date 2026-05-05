import type { DatabaseManager } from '../data/db';
import type { EventBus } from './events/bus';

type WorkerContext = {
    dbManager: DatabaseManager;
    eventBus: EventBus;
}

export async function runPreviewWorker(mediaIds: string[], context: WorkerContext) {
    const { runPreviewJob } = await import('./jobs/previews');
    await runPreviewJob(mediaIds, context.dbManager, context.eventBus);
}

export async function runAutoScanWorker(scanSessionId: string, folderPath: string, context: WorkerContext) {
    const { runScanJob } = await import('./jobs/scan');
    await runScanJob(scanSessionId, folderPath, context.dbManager, context.eventBus, new AbortController().signal);
}
