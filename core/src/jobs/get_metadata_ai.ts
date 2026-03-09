import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { callProUpgrade, callWithFallback, type ProPendingReason } from './ai_metadata_fallback';
import type {
    RowData} from './ai_metadata_shared';
import {
    MODEL_PRO,
    clearProPending,
    emitAiJobProgress,
    getUnrecoverableAiReason,
} from './ai_metadata_shared';
import { existsSync, prepareImagePayload, recordErrorIssue, saveAiMetadataResult } from './ai_metadata_job_support';
import { isDailyQuotaExceeded, isRateLimited } from './quota_manager';
import {
    initCounters,
    resolveModelConfig,
    type JobCounters,
    type ModelConfig,
    type ProStopReason,
    validateApiKey
} from './get_metadata_ai.config';

export { getPendingProAssetIds } from './ai_metadata_shared';

type QueueRow = RowData;
type AiMetadataQueueMode = 'fresh' | 'pro_pending' | 'all';
type QueueSnapshot = { freshRows: QueueRow[]; proPendingRows: QueueRow[]; totalItems: number };
type JobContext = {
    db: ReturnType<DatabaseManager['getDb']>;
    eventBus: EventBus;
    jobId: string;
    pipelineStage: string;
    totalItems: number;
    startedAtMs: number;
    preferredModel: string;
    flashModel: string;
    csvContent: string;
    keyTrimmed: string;
    genAI: import('@google/generative-ai').GoogleGenerativeAI;
};
type RowOutcome = 'continue' | 'stop_queue';
const AUTO_ROW_SELECT = `
    SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
    FROM assets a
    LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
    LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
`;

function loadAutoFreshRows(db: ReturnType<DatabaseManager['getDb']>): QueueRow[] {
    const rows = db.prepare(`
        ${AUTO_ROW_SELECT}
        LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'ai_metadata'
        WHERE dr.id IS NULL
        ORDER BY a.created_at ASC
    `).all() as RowData[];
    return rows;
}

function loadManualRows(
    db: ReturnType<DatabaseManager['getDb']>,
    mediaIds: string[]
): QueueRow[] {
    const placeholders = mediaIds.map(() => '?').join(',');
    const rows = db.prepare(`
        ${AUTO_ROW_SELECT}
        WHERE a.id IN (${placeholders})
    `).all(...mediaIds) as RowData[];
    return rows;
}

function loadManualProPendingRows(
    db: ReturnType<DatabaseManager['getDb']>,
    mediaIds: string[]
): QueueRow[] {
    const placeholders = mediaIds.map(() => '?').join(',');
    const rows = db.prepare(`
        ${AUTO_ROW_SELECT}
        INNER JOIN derived_results drp ON a.id = drp.asset_id AND drp.task = 'ai_metadata_pro_pending'
        WHERE a.id IN (${placeholders})
        ORDER BY drp.created_at ASC, a.created_at ASC
    `).all(...mediaIds) as RowData[];
    return rows;
}

function loadAutoProPendingRows(db: ReturnType<DatabaseManager['getDb']>): QueueRow[] {
    const rows = db.prepare(`
        ${AUTO_ROW_SELECT}
        INNER JOIN derived_results drp ON a.id = drp.asset_id AND drp.task = 'ai_metadata_pro_pending'
        ORDER BY drp.created_at ASC, a.created_at ASC
    `).all() as RowData[];
    return rows;
}

function loadRowsToProcess(
    db: ReturnType<DatabaseManager['getDb']>,
    mediaIds: string[] | 'auto',
    queueMode: AiMetadataQueueMode,
    includeProPending: boolean
): QueueSnapshot {
    if (mediaIds !== 'auto') {
        if (queueMode === 'pro_pending') {
            const proPendingRows = loadManualProPendingRows(db, mediaIds);
            return { freshRows: [], proPendingRows, totalItems: proPendingRows.length };
        }
        const freshRows = loadManualRows(db, mediaIds);
        return { freshRows, proPendingRows: [], totalItems: freshRows.length };
    }

    if (queueMode === 'pro_pending') {
        const proPendingRows = loadAutoProPendingRows(db);
        return { freshRows: [], proPendingRows, totalItems: proPendingRows.length };
    }

    const freshRows = loadAutoFreshRows(db);
    if (queueMode === 'fresh' || !includeProPending) {
        return { freshRows, proPendingRows: [], totalItems: freshRows.length };
    }

    const freshIds = new Set(freshRows.map((row) => row.id));
    const proPendingRows = loadAutoProPendingRows(db).filter((row) => !freshIds.has(row.id));
    return {
        freshRows,
        proPendingRows,
        totalItems: freshRows.length + proPendingRows.length
    };
}

function isUnsafeRow(row: RowData): boolean {
    return row.sensitivity_status === 'unsafe' ||
        (row.sensitivity_status !== 'safe' && row.sensitivity_score !== null && row.sensitivity_score > 75);
}

function finishRow(
    counters: JobCounters,
    context: JobContext,
    rowPath: string,
    updates: { errors?: number; skipped?: number } = {}
): void {
    counters.errors += updates.errors ?? 0;
    counters.skipped += updates.skipped ?? 0;
    counters.processed += 1;
    emitAiJobProgress(
        context.eventBus,
        context.jobId,
        counters.processed,
        context.totalItems,
        counters.errors,
        context.startedAtMs,
        rowPath
    );
}

function recordJobError(row: RowData, context: JobContext, message: string, counters: JobCounters): void {
    console.error(`[AiMetadataJob] FAILED asset ${row.id} | key: ...${context.keyTrimmed.slice(-4)} | ${message}`);
    recordErrorIssue(context.db, row, context.jobId, message);
    context.eventBus.emit({
        type: 'JobFailed',
        jobId: context.jobId,
        pipelineStage: context.pipelineStage,
        severity: 'error',
        reason: message
    });
    finishRow(counters, context, row.original_path, { errors: 1 });
}

function detectProStopReason(): ProStopReason | null {
    if (isDailyQuotaExceeded(MODEL_PRO)) {return 'pro_daily_quota';}
    if (isRateLimited(MODEL_PRO)) {return 'pro_rate_limit';}
    return null;
}

function recordProFallback(rowId: string, reason: ProPendingReason, counters: JobCounters): void {
    counters.proQueued += 1;
    counters.proQueuedIdsByReason[reason].push(rowId);
}

async function processFreshRow(
    row: QueueRow,
    counters: JobCounters,
    context: JobContext
): Promise<RowOutcome> {
    if (isUnsafeRow(row)) {
        finishRow(counters, context, row.original_path, { skipped: 1 });
        return 'continue';
    }

    if (!existsSync(row.original_path)) {
        recordJobError(row, context, 'Image file not found for AI metadata extraction.', counters);
        return 'continue';
    }

    try {
        const { filename, exifDataString, imageBase64, mimeType } = await prepareImagePayload(row);
        const { result: parsedResult, usedModel, proPendingReason } = await callWithFallback(
            context.genAI,
            row,
            filename,
            exifDataString,
            context.csvContent,
            imageBase64,
            mimeType,
            context.preferredModel,
            context.db
        );

        if (proPendingReason) {
            recordProFallback(row.id, proPendingReason, counters);
        }
        if (usedModel === MODEL_PRO) {
            clearProPending(context.db, row.id);
        }

        saveAiMetadataResult(context.db, row, usedModel, parsedResult as unknown as Record<string, unknown>);
        context.eventBus.emit({ type: 'AssetUpdated', assetId: row.id });
        finishRow(counters, context, row.original_path);
        return 'continue';
    } catch (err: unknown) {
        const error = err as Error;
        if (error.message === 'DAILY_QUOTA_EXCEEDED') {
            counters.freshStopReason = 'flash_daily_quota';
            return 'stop_queue';
        }
        if (error.message === 'FLASH_RATE_LIMITED_STOP') {
            counters.freshStopReason = 'flash_rate_limit';
            return 'stop_queue';
        }

        const unrecoverableReason = getUnrecoverableAiReason(error);
        if (unrecoverableReason) {
            throw new Error(`UNRECOVERABLE_AI: ${unrecoverableReason}`, { cause: err });
        }

        recordJobError(row, context, error.message, counters);
        return 'continue';
    }
}

async function processProPendingRow(
    row: QueueRow,
    counters: JobCounters,
    context: JobContext
): Promise<RowOutcome> {
    if (isUnsafeRow(row)) {
        clearProPending(context.db, row.id);
        finishRow(counters, context, row.original_path, { skipped: 1 });
        return 'continue';
    }

    if (!existsSync(row.original_path)) {
        clearProPending(context.db, row.id);
        recordJobError(row, context, 'Image file not found for AI metadata pro upgrade.', counters);
        return 'continue';
    }

    try {
        const { filename, exifDataString, imageBase64, mimeType } = await prepareImagePayload(row);
        const result = await callProUpgrade(
            context.genAI,
            filename,
            exifDataString,
            context.csvContent,
            imageBase64,
            mimeType
        );

        if (!result) {
            const stopReason = detectProStopReason();
            if (stopReason) {
                counters.proStopReason = stopReason;
                return 'stop_queue';
            }

            recordJobError(row, context, 'Pro AI metadata upgrade produced no result.', counters);
            return 'continue';
        }

        saveAiMetadataResult(context.db, row, result.usedModel, result.result as unknown as Record<string, unknown>);
        clearProPending(context.db, row.id);
        context.eventBus.emit({ type: 'AssetUpdated', assetId: row.id });
        finishRow(counters, context, row.original_path);
        return 'continue';
    } catch (err: unknown) {
        const error = err as Error;
        const unrecoverableReason = getUnrecoverableAiReason(error);
        if (unrecoverableReason) {
            throw new Error(`UNRECOVERABLE_AI: ${unrecoverableReason}`, { cause: err });
        }

        recordJobError(row, context, error.message, counters);
        return 'continue';
    }
}

function appendDeferredIds(target: string[], rows: QueueRow[], startIndex: number): void {
    for (let index = startIndex; index < rows.length; index += 1) {
        target.push(rows[index].id);
    }
}

async function runFreshQueue(rows: QueueRow[], counters: JobCounters, context: JobContext): Promise<void> {
    for (let index = 0; index < rows.length; index += 1) {
        await waitIfPaused();
        const outcome = await processFreshRow(rows[index], counters, context);
        if (outcome === 'stop_queue') {
            appendDeferredIds(counters.freshDeferredIds, rows, index);
            return;
        }
    }
}

async function runProPendingQueue(rows: QueueRow[], counters: JobCounters, context: JobContext): Promise<void> {
    for (let index = 0; index < rows.length; index += 1) {
        await waitIfPaused();
        const outcome = await processProPendingRow(rows[index], counters, context);
        if (outcome === 'stop_queue') {
            appendDeferredIds(counters.proDeferredIds, rows, index);
            return;
        }
    }
}

function emitQuotaWarnings(counters: JobCounters, context: JobContext): void {
    for (const reason of ['daily_quota', 'rate_limit'] as const) {
        const assetIds = counters.proQueuedIdsByReason[reason];
        if (assetIds.length === 0) {continue;}
        context.eventBus.emit({
            type: 'QuotaWarning',
            model: MODEL_PRO,
            fallbackModel: context.flashModel,
            reason,
            assetIds,
            pendingProCount: assetIds.length
        });
    }

    if (counters.freshStopReason && counters.freshDeferredIds.length > 0) {
        context.eventBus.emit({
            type: 'QuotaWarning',
            model: context.flashModel,
            fallbackModel: '',
            reason: counters.freshStopReason === 'flash_daily_quota' ? 'daily_quota' : 'rate_limit',
            assetIds: counters.freshDeferredIds,
            pendingProCount: 0
        });
    }

    if (counters.proStopReason && counters.proDeferredIds.length > 0) {
        context.eventBus.emit({
            type: 'QuotaWarning',
            model: MODEL_PRO,
            fallbackModel: '',
            reason: counters.proStopReason === 'pro_daily_quota' ? 'daily_quota' : 'rate_limit',
            assetIds: counters.proDeferredIds,
            pendingProCount: counters.proDeferredIds.length
        });
    }
}

function buildCompletionSummary(counters: JobCounters): string {
    const fragments: string[] = [];
    if (counters.proQueued > 0) {
        fragments.push(`${counters.proQueued} queued for pro follow-up`);
    }
    if (counters.freshDeferredIds.length > 0 && counters.freshStopReason) {
        const label = counters.freshStopReason === 'flash_daily_quota' ? 'flash daily quota' : 'flash rate limit';
        fragments.push(`${counters.freshDeferredIds.length} fresh items deferred (${label})`);
    }
    if (counters.proDeferredIds.length > 0 && counters.proStopReason) {
        const label = counters.proStopReason === 'pro_daily_quota' ? 'pro daily quota' : 'pro rate limit';
        fragments.push(`${counters.proDeferredIds.length} pro upgrades deferred (${label})`);
    }
    return fragments.length > 0 ? ` ${fragments.join(', ')}.` : '';
}

function finalizeBatch(counters: JobCounters, context: JobContext): void {
    const succeeded = counters.processed - counters.errors - counters.skipped;
    console.log(
        `[AiMetadataJob] Done. ${succeeded} succeeded, ${counters.skipped} skipped, ${counters.errors} errors.${buildCompletionSummary(counters)}`
    );

    emitQuotaWarnings(counters, context);
    context.eventBus.emit({ type: 'JobCompleted', jobId: context.jobId, pipelineStage: context.pipelineStage });
}

function shouldProcessProPendingQueue(
    queueMode: AiMetadataQueueMode,
    preferredModel: string,
    proPendingRows: QueueRow[]
): boolean {
    if (proPendingRows.length === 0) {return false;}
    if (queueMode === 'pro_pending') {return true;}
    if (queueMode === 'fresh') {return false;}
    return preferredModel === MODEL_PRO;
}
function resolvePipelineStage(queueMode: AiMetadataQueueMode, queueStage?: string): string {
    if (queueStage) {return queueStage;}
    if (queueMode === 'pro_pending') {return 'ai_metadata_31p';}
    if (queueMode === 'fresh') {return 'ai_metadata_3f';}
    return 'ai_metadata';
}
function resolveJobPrefix(queueMode: AiMetadataQueueMode): string {
    if (queueMode === 'pro_pending') {return 'ai_meta_31p';}
    if (queueMode === 'fresh') {return 'ai_meta_3f';}
    return 'ai_meta';
}
function resolveRunOptions(
    uiJobId: string | undefined,
    options: { queueMode?: AiMetadataQueueMode; queueStage?: string }
): { queueMode: AiMetadataQueueMode; pipelineStage: string; jobId: string } {
    const queueMode = options.queueMode || 'all';
    const pipelineStage = resolvePipelineStage(queueMode, options.queueStage);
    const jobId = uiJobId || `${resolveJobPrefix(queueMode)}-${Date.now()}`;
    return { queueMode, pipelineStage, jobId };
}
async function createJobContext(
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus,
    jobId: string,
    pipelineStage: string,
    totalItems: number,
    modelConfig: ModelConfig
): Promise<JobContext> {
    const startedAtMs = Date.now();
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    return {
        db,
        eventBus,
        jobId,
        pipelineStage,
        totalItems,
        startedAtMs,
        preferredModel: modelConfig.preferredModel,
        flashModel: modelConfig.flashModel,
        csvContent: modelConfig.csvContent,
        keyTrimmed: modelConfig.keyTrimmed,
        genAI: new GoogleGenerativeAI(modelConfig.keyTrimmed)
    };
}
export async function runAiMetadataJob(
    mediaIds: string[] | 'auto',
    dbManager: DatabaseManager,
    eventBus: EventBus,
    uiJobId?: string,
    options: { queueMode?: AiMetadataQueueMode; queueStage?: string } = {}
) {
    const db = dbManager.getDb();
    const { queueMode, pipelineStage, jobId } = resolveRunOptions(uiJobId, options);
    eventBus.emit({ type: 'JobStarted', jobId, pipelineStage, totalItems: 0 });

    const keyTrimmed = validateApiKey(dbManager, eventBus, jobId, pipelineStage);
    if (!keyTrimmed) {return;}

    const modelConfig = await resolveModelConfig(dbManager, keyTrimmed);
    const queues = loadRowsToProcess(db, mediaIds, queueMode, modelConfig.preferredModel === MODEL_PRO);
    if (queues.totalItems === 0) {
        console.log('[AiMetadataJob] Nothing to process.');
        eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage });
        return;
    }

    const counters = initCounters();
    const context = await createJobContext(db, eventBus, jobId, pipelineStage, queues.totalItems, modelConfig);

    eventBus.emit({ type: 'JobProgress', jobId, processedItems: 0, totalItems: queues.totalItems, errorCount: 0, throughputIps: 0 });

    try {
        await runFreshQueue(queues.freshRows, counters, context);
        if (shouldProcessProPendingQueue(queueMode, modelConfig.preferredModel, queues.proPendingRows)) {
            await runProPendingQueue(queues.proPendingRows, counters, context);
        }
        finalizeBatch(counters, context);
    } catch (err: unknown) {
        const error = err as Error;
        const reason = error.message.startsWith('UNRECOVERABLE_AI: ')
            ? error.message.replace('UNRECOVERABLE_AI: ', '')
            : `AI metadata job crashed: ${error.message}`;
        eventBus.emit({
            type: 'JobFailed',
            jobId,
            pipelineStage,
            severity: 'fatal',
            reason
        });
    }
}
