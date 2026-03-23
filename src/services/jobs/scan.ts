import type { DatabaseManager } from '../../data/db';
import { hashFile } from '../file-utils';
import { join, extname } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { persistAssetEmbeddedMetadata } from '../embeddedMetadata';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']);

function emitScanProgress(
    eventBus: EventBus,
    jobId: string,
    processed: number,
    totalToProcess: number,
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
        totalItems: totalToProcess,
        currentItemPath,
        throughputIps,
        errorCount: errors
    });

    return now;
}

function countImageFiles(rootPath: string): number {
    let total = 0;
    const stack = [rootPath];
    while (stack.length > 0) {
        const dir = stack.pop()!;
        try {
            const files = readdirSync(dir);
            for (const file of files) {
                const fullPath = join(dir, file);
                try {
                    const stats = statSync(fullPath);
                    if (stats.isDirectory()) {stack.push(fullPath);}
                    else if (IMAGE_EXTENSIONS.has(extname(fullPath).toLowerCase())) {total++;}
                } catch {
                    // Ignore inaccessible files.
                }
            }
        } catch {
            // Ignore unreadable directories.
        }
    }
    return total;
}

function isImageFile(fullPath: string): boolean {
    return IMAGE_EXTENSIONS.has(extname(fullPath).toLowerCase());
}

function emitMediaDiscovered(
    eventBus: EventBus,
    jobId: string,
    mediaId: string,
    filePath: string,
    width: number,
    height: number
): void {
    eventBus.emit({
        type: 'MediaDiscovered',
        mediaId,
        filePath,
        width,
        height,
        scanSessionId: jobId
    });
}

async function ingestNewAsset(
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus,
    jobId: string,
    fullPath: string,
    stats: Stats
): Promise<void> {
    const mediaId = uuidv4();
    const hash = await hashFile(fullPath);

    db.prepare(`
        INSERT INTO assets (
            id, original_path, file_hash, file_size, width, height, exif_datetime, metadata_timestamp_source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(mediaId, fullPath, hash, stats.size, 0, 0, null, null, new Date().toISOString());
    const snapshot = await persistAssetEmbeddedMetadata({
        db,
        assetId: mediaId,
        originalPath: fullPath,
        fileSize: stats.size,
        birthtime: stats.birthtime,
    });
    emitMediaDiscovered(eventBus, jobId, mediaId, fullPath, snapshot?.width ?? 0, snapshot?.height ?? 0);
}

function shouldSkipDueToFatalIssue(db: ReturnType<DatabaseManager['getDb']>, mediaId: string): boolean {
    const fatalIssue = db.prepare("SELECT id FROM processing_issues WHERE asset_id = ? AND severity = 'fatal'").get(mediaId);
    return Boolean(fatalIssue);
}

function shouldRetriggerPipeline(db: ReturnType<DatabaseManager['getDb']>, mediaId: string): { width: number; height: number } | null {
    const dr = db.prepare('SELECT id FROM derived_results WHERE asset_id = ? AND task = ?').get(mediaId, 'face_detection');
    const assetRecord = db.prepare('SELECT p.path as preview_path, a.width, a.height FROM assets a LEFT JOIN previews p ON a.id = p.asset_id WHERE a.id = ?')
        .get(mediaId) as { preview_path: string | null, width: number, height: number };

    if (!assetRecord?.preview_path || !dr) {return { width: assetRecord.width, height: assetRecord.height };}
    return null;
}

async function processImageFile(
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus,
    jobId: string,
    fullPath: string,
    stats: Stats
): Promise<boolean> {
    const exists = db.prepare('SELECT id FROM assets WHERE original_path = ?').get(fullPath) as { id: string } | undefined;
    if (!exists) {
        await ingestNewAsset(db, eventBus, jobId, fullPath, stats);
        return true;
    }

    const mediaId = exists.id;
    if (shouldSkipDueToFatalIssue(db, mediaId)) {
        console.warn(`[Scanner] Skipping ${fullPath} due to recorded fatal processing issue.`);
        return true;
    }

    const retriggerData = shouldRetriggerPipeline(db, mediaId);
    if (retriggerData) {
        emitMediaDiscovered(eventBus, jobId, mediaId, fullPath, retriggerData.width, retriggerData.height);
    }

    return true;
}

export async function runScanJob(
    jobId: string,
    rootPath: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    const db = dbManager.getDb();
    let processed = 0;
    let errors = 0;
    const startTime = Date.now();
    let lastReportTime = startTime;
    let totalToProcess = 0;

    eventBus.emit({
        type: 'JobStarted',
        jobId,
        pipelineStage: 'scan',
        totalItems: 0
    });

    lastReportTime = emitScanProgress(eventBus, jobId, processed, totalToProcess, errors, startTime, lastReportTime, 'Preparing scan (counting files)', true);
    totalToProcess = countImageFiles(rootPath);
    lastReportTime = emitScanProgress(eventBus, jobId, processed, totalToProcess, errors, startTime, lastReportTime, 'Counting complete', true);

    const stack = [rootPath];
    while (stack.length > 0) {
        if (signal?.aborted) {
            console.log(`Job ${jobId} cancelled.`);
            eventBus.emit({
                type: 'JobFailed',
                jobId,
                severity: 'warning',
                reason: 'Cancelled by user'
            });
            emitScanProgress(eventBus, jobId, processed, totalToProcess, errors, startTime, lastReportTime, undefined, true);
            return;
        }

        const dir = stack.pop()!;
        try {
            const files = readdirSync(dir);
            for (const file of files) {
                await waitIfPaused(signal);
                const fullPath = join(dir, file);
                try {
                    const stats = statSync(fullPath);
                    if (stats.isDirectory()) {
                        stack.push(fullPath);
                        continue;
                    }
                    if (!isImageFile(fullPath)) {continue;}
                    const shouldCountProcessed = await processImageFile(db, eventBus, jobId, fullPath, stats);
                    if (shouldCountProcessed) {processed++;}
                    lastReportTime = emitScanProgress(eventBus, jobId, processed, totalToProcess, errors, startTime, lastReportTime, fullPath);
                } catch (err: unknown) {
                    const e = err as Error;
                    console.error(`Error processing ${fullPath}:`, e);
                    errors++;
                    lastReportTime = emitScanProgress(eventBus, jobId, processed, totalToProcess, errors, startTime, lastReportTime, fullPath);
                }
            }
        } catch (err: unknown) {
            const e = err as Error;
            console.error(`Error reading dir ${dir}:`, e);
            errors++;
            eventBus.emit({
                type: 'JobFailed',
                jobId,
                severity: 'error',
                reason: e.message
            });
        }
    }

    emitScanProgress(eventBus, jobId, processed, totalToProcess, errors, startTime, lastReportTime, undefined, true);

    eventBus.emit({
        type: 'JobCompleted',
        jobId
    });
}
