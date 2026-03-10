import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { callProUpgrade, callWithFallback, type ProPendingReason } from './ai_metadata_fallback';
import type { RowData } from './ai_metadata_shared';
import {
    MODEL_PRO,
    clearProPendingRecord,
    emitAiJobProgress,
    ensureProPendingRecord,
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
    validateApiKey,
} from './get_metadata_ai.config';

type AiMetadataV2WorkerMode = 'fresh' | 'pro_pending';
type QueueRow = RowData;
type QueueSnapshot = { freshRows: QueueRow[]; proPendingRows: QueueRow[]; totalItems: number };
type RowOutcome = 'continue' | 'stop_queue';
type PipelineStage = 'ai_metadata_v2_3f' | 'ai_metadata_v2_31p';
type JobContext = {
    db: ReturnType<DatabaseManager['getDb']>;
    eventBus: EventBus;
    jobId: string;
    pipelineStage: PipelineStage;
    workerMode: AiMetadataV2WorkerMode;
    totalItems: number;
    startedAtMs: number;
    preferredModel: string;
    flashModel: string;
    csvContent: string;
    keyTrimmed: string;
    genAI: import('@google/generative-ai').GoogleGenerativeAI;
};

const AUTO_ROW_SELECT = `
    SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
    FROM assets a
    LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
    LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
`;

function loadAutoFreshRows(db: ReturnType<DatabaseManager['getDb']>): QueueRow[] {
    return db.prepare(`
        ${AUTO_ROW_SELECT}
        LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'ai_metadata'
        WHERE dr.id IS NULL
        ORDER BY a.created_at ASC
    `).all() as QueueRow[];
}

function loadManualRows(
    db: ReturnType<DatabaseManager['getDb']>,
    mediaIds: string[]
): QueueRow[] {
    const placeholders = mediaIds.map(() => '?').join(',');
    return db.prepare(`
        ${AUTO_ROW_SELECT}
        WHERE a.id IN (${placeholders})
    `).all(...mediaIds) as QueueRow[];
}

function loadAutoProPendingRows(db: ReturnType<DatabaseManager['getDb']>): QueueRow[] {
    return db.prepare(`
        ${AUTO_ROW_SELECT}
        INNER JOIN derived_results drp ON a.id = drp.asset_id AND drp.task = 'ai_metadata_pro_pending'
        ORDER BY drp.created_at ASC, a.created_at ASC
    `).all() as QueueRow[];
}

function loadManualProPendingRows(
    db: ReturnType<DatabaseManager['getDb']>,
    mediaIds: string[]
): QueueRow[] {
    const placeholders = mediaIds.map(() => '?').join(',');
    return db.prepare(`
        ${AUTO_ROW_SELECT}
        INNER JOIN derived_results drp ON a.id = drp.asset_id AND drp.task = 'ai_metadata_pro_pending'
        WHERE a.id IN (${placeholders})
        ORDER BY drp.created_at ASC, a.created_at ASC
    `).all(...mediaIds) as QueueRow[];
}

function loadRowsToProcess(
    db: ReturnType<DatabaseManager['getDb']>,
    mediaIds: string[] | 'auto',
    workerMode: AiMetadataV2WorkerMode
): QueueSnapshot {
    if (workerMode === 'pro_pending') {
        const proPendingRows = mediaIds === 'auto'
            ? loadAutoProPendingRows(db)
            : loadManualProPendingRows(db, mediaIds);
        return { freshRows: [], proPendingRows, totalItems: proPendingRows.length };
    }

    const freshRows = mediaIds === 'auto'
        ? loadAutoFreshRows(db)
        : loadManualRows(db, mediaIds);
    return { freshRows, proPendingRows: [], totalItems: freshRows.length };
}

function isUnsafeRow(row: RowData): boolean {
    return row.sensitivity_status === 'unsafe'
        || (row.sensitivity_status !== 'safe' && row.sensitivity_score !== null && row.sensitivity_score > 75);
}

function emitRowCompletion(context: JobContext, rowId: string, usedModel: string, queuedProUpgrade = false): void {
    if (context.workerMode === 'pro_pending') {
        context.eventBus.emit({ type: 'AiMetadataV2ProCompleted', mediaId: rowId, usedModel });
        return;
    }

    context.eventBus.emit({
        type: 'AiMetadataV2FreshCompleted',
        mediaId: rowId,
        usedModel,
        queuedProUpgrade,
    });
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

function emitQueuedUpgrade(context: JobContext, rowId: string, reason: ProPendingReason): void {
    ensureProPendingRecord(context.db, rowId);
    context.eventBus.emit({
        type: 'AiMetadataV2UpgradeQueued',
        mediaId: rowId,
        reason,
        proModel: MODEL_PRO,
    });
}

function recordRowIssue(
    row: RowData,
    context: JobContext,
    message: string,
    counters: JobCounters,
    options: { clearProPending?: boolean } = {}
): void {
    console.error(`[AiMetadataV2Job] WARN asset ${row.id} | key: ...${context.keyTrimmed.slice(-4)} | ${message}`);
    recordErrorIssue(context.db, row, context.jobId, message);
    if (options.clearProPending) {
        clearProPendingRecord(context.db, row.id);
    }
    emitRowCompletion(context, row.id, context.workerMode === 'pro_pending' ? MODEL_PRO : context.flashModel);
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
        emitRowCompletion(context, row.id, context.flashModel);
        finishRow(counters, context, row.original_path, { skipped: 1 });
        return 'continue';
    }

    if (!existsSync(row.original_path)) {
        recordRowIssue(row, context, 'Image file not found for AI metadata extraction.', counters);
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
            context.db,
            {
                onProPending: (assetId, reason) => {
                    emitQueuedUpgrade(context, assetId, reason);
                },
            }
        );

        if (proPendingReason) {
            recordProFallback(row.id, proPendingReason, counters);
        }
        if (usedModel === MODEL_PRO) {
            clearProPendingRecord(context.db, row.id);
        }

        saveAiMetadataResult(context.db, row, usedModel, parsedResult as unknown as Record<string, unknown>);
        context.eventBus.emit({ type: 'AssetUpdated', assetId: row.id });
        emitRowCompletion(context, row.id, usedModel, Boolean(proPendingReason));
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

        recordRowIssue(row, context, error.message, counters);
        return 'continue';
    }
}

async function processProPendingRow(
    row: QueueRow,
    counters: JobCounters,
    context: JobContext
): Promise<RowOutcome> {
    if (isUnsafeRow(row)) {
        clearProPendingRecord(context.db, row.id);
        emitRowCompletion(context, row.id, MODEL_PRO);
        finishRow(counters, context, row.original_path, { skipped: 1 });
        return 'continue';
    }

    if (!existsSync(row.original_path)) {
        recordRowIssue(row, context, 'Image file not found for AI metadata pro upgrade.', counters, { clearProPending: true });
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

            recordRowIssue(row, context, 'Pro AI metadata upgrade produced no result.', counters, { clearProPending: true });
            return 'continue';
        }

        saveAiMetadataResult(context.db, row, result.usedModel, result.result as unknown as Record<string, unknown>);
        clearProPendingRecord(context.db, row.id);
        context.eventBus.emit({ type: 'AssetUpdated', assetId: row.id });
        emitRowCompletion(context, row.id, result.usedModel);
        finishRow(counters, context, row.original_path);
        return 'continue';
    } catch (err: unknown) {
        const error = err as Error;
        const unrecoverableReason = getUnrecoverableAiReason(error);
        if (unrecoverableReason) {
            throw new Error(`UNRECOVERABLE_AI: ${unrecoverableReason}`, { cause: err });
        }

        recordRowIssue(row, context, error.message, counters, { clearProPending: true });
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

function releaseDeferredRows(
    db: ReturnType<DatabaseManager['getDb']>,
    pipelineStage: PipelineStage,
    mediaIds: string[]
): void {
    if (mediaIds.length === 0) {return;}
    const placeholders = mediaIds.map(() => '?').join(',');
    db.prepare(`
        UPDATE task_queue
        SET status = 'pending',
            claimed_by = NULL,
            claimed_at = NULL
        WHERE pipeline_stage = ? AND status = 'processing' AND media_id IN (${placeholders})
    `).run(pipelineStage, ...mediaIds);
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
            pendingProCount: assetIds.length,
        });
    }

    if (counters.freshStopReason && counters.freshDeferredIds.length > 0) {
        context.eventBus.emit({
            type: 'QuotaWarning',
            model: context.flashModel,
            fallbackModel: '',
            reason: counters.freshStopReason === 'flash_daily_quota' ? 'daily_quota' : 'rate_limit',
            assetIds: counters.freshDeferredIds,
            pendingProCount: 0,
        });
    }

    if (counters.proStopReason && counters.proDeferredIds.length > 0) {
        context.eventBus.emit({
            type: 'QuotaWarning',
            model: MODEL_PRO,
            fallbackModel: '',
            reason: counters.proStopReason === 'pro_daily_quota' ? 'daily_quota' : 'rate_limit',
            assetIds: counters.proDeferredIds,
            pendingProCount: counters.proDeferredIds.length,
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
    releaseDeferredRows(context.db, 'ai_metadata_v2_3f', counters.freshDeferredIds);
    releaseDeferredRows(context.db, 'ai_metadata_v2_31p', counters.proDeferredIds);

    const succeeded = counters.processed - counters.errors - counters.skipped;
    console.log(
        `[AiMetadataV2Job] Done. ${succeeded} succeeded, ${counters.skipped} skipped, ${counters.errors} warnings.${buildCompletionSummary(counters)}`
    );

    emitQuotaWarnings(counters, context);
    context.eventBus.emit({ type: 'JobCompleted', jobId: context.jobId, pipelineStage: context.pipelineStage });
}

function resolvePipelineStage(workerMode: AiMetadataV2WorkerMode): PipelineStage {
    return workerMode === 'pro_pending' ? 'ai_metadata_v2_31p' : 'ai_metadata_v2_3f';
}

function resolveJobPrefix(workerMode: AiMetadataV2WorkerMode): string {
    return workerMode === 'pro_pending' ? 'ai_meta_v2_31p' : 'ai_meta_v2_3f';
}

function resolveRunOptions(options: {
    workerMode?: AiMetadataV2WorkerMode;
    pipelineStage?: PipelineStage;
    jobId?: string;
}): {
    workerMode: AiMetadataV2WorkerMode;
    pipelineStage: PipelineStage;
    jobId: string;
} {
    const workerMode = options.workerMode ?? 'fresh';
    const pipelineStage = options.pipelineStage ?? resolvePipelineStage(workerMode);
    const jobId = options.jobId ?? `${resolveJobPrefix(workerMode)}-${Date.now()}`;
    return { workerMode, pipelineStage, jobId };
}

async function createJobContext(
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus,
    modelConfig: ModelConfig,
    options: {
        jobId: string;
        pipelineStage: PipelineStage;
        workerMode: AiMetadataV2WorkerMode;
        totalItems: number;
    }
): Promise<JobContext> {
    const startedAtMs = Date.now();
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    return {
        db,
        eventBus,
        jobId: options.jobId,
        pipelineStage: options.pipelineStage,
        workerMode: options.workerMode,
        totalItems: options.totalItems,
        startedAtMs,
        preferredModel: modelConfig.preferredModel,
        flashModel: modelConfig.flashModel,
        csvContent: modelConfig.csvContent,
        keyTrimmed: modelConfig.keyTrimmed,
        genAI: new GoogleGenerativeAI(modelConfig.keyTrimmed),
    };
}

export async function runAiMetadataV2Job(
    mediaIds: string[] | 'auto',
    dbManager: DatabaseManager,
    eventBus: EventBus,
    options: {
        workerMode?: AiMetadataV2WorkerMode;
        pipelineStage?: PipelineStage;
        jobId?: string;
    } = {}
): Promise<void> {
    const db = dbManager.getDb();
    const runOptions = resolveRunOptions(options);
    eventBus.emit({
        type: 'JobStarted',
        jobId: runOptions.jobId,
        pipelineStage: runOptions.pipelineStage,
        totalItems: 0,
    });

    const keyTrimmed = validateApiKey(dbManager, eventBus, runOptions.jobId, runOptions.pipelineStage);
    if (!keyTrimmed) {return;}

    const modelConfig = await resolveModelConfig(dbManager, keyTrimmed);
    const queues = loadRowsToProcess(db, mediaIds, runOptions.workerMode);
    if (queues.totalItems === 0) {
        console.log('[AiMetadataV2Job] Nothing to process.');
        eventBus.emit({ type: 'JobCompleted', jobId: runOptions.jobId, pipelineStage: runOptions.pipelineStage });
        return;
    }

    const counters = initCounters();
    const context = await createJobContext(db, eventBus, modelConfig, {
        ...runOptions,
        totalItems: queues.totalItems,
    });

    eventBus.emit({
        type: 'JobProgress',
        jobId: runOptions.jobId,
        processedItems: 0,
        totalItems: queues.totalItems,
        errorCount: 0,
        throughputIps: 0,
    });

    try {
        if (runOptions.workerMode === 'pro_pending') {
            await runProPendingQueue(queues.proPendingRows, counters, context);
        } else {
            await runFreshQueue(queues.freshRows, counters, context);
        }
        finalizeBatch(counters, context);
    } catch (err: unknown) {
        const error = err as Error;
        const reason = error.message.startsWith('UNRECOVERABLE_AI: ')
            ? error.message.replace('UNRECOVERABLE_AI: ', '')
            : `AI metadata v2 job crashed: ${error.message}`;
        eventBus.emit({
            type: 'JobFailed',
            jobId: runOptions.jobId,
            pipelineStage: runOptions.pipelineStage,
            severity: 'fatal',
            reason,
        });
    }
}
