import { DatabaseManager } from '../db';
import { hashFile, getFileStats, getExifData } from '../file-utils';
import { join, extname } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']);

export async function runScanJob(
    jobId: string,
    rootPath: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    console.error(`[ScanJob] Starting for ${rootPath}`);
    const db = dbManager.getDb();
    let processed = 0;
    let errors = 0;

    // 1. Initial Count (Quick recursive scan for total)
    console.error(`[ScanJob] Counting files...`);
    let totalToProcess = 0;
    const countStack = [rootPath];
    while (countStack.length > 0) {
        const dir = countStack.pop()!;
        try {
            const files = readdirSync(dir);
            for (const file of files) {
                const fullPath = join(dir, file);
                try {
                    const stats = statSync(fullPath);
                    if (stats.isDirectory()) {
                        countStack.push(fullPath);
                    } else {
                        const ext = extname(fullPath).toLowerCase();
                        if (IMAGE_EXTENSIONS.has(ext)) {
                            totalToProcess++;
                        }
                    }
                } catch (e) { }
            }
        } catch (e) { }
    }
    console.error(`[ScanJob] Total files found: ${totalToProcess}`);

    const stack = [rootPath];

    const startTime = Date.now();
    let lastReportTime = startTime;

    // Emit initial event with total
    eventBus.emit({
        type: 'JobStarted',
        jobId: jobId,
        pipelineStage: 'scan',
        totalItems: totalToProcess
    });

    const reportProgress = (currentItemPath?: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastReportTime < 500) return; // Throttle to 500ms

        const elapsedSec = (now - startTime) / 1000;
        const throughputIps = elapsedSec > 0 ? processed / elapsedSec : 0;

        eventBus.emit({
            type: 'JobProgress',
            jobId: jobId,
            processedItems: processed,
            currentItemPath,
            throughputIps,
            errorCount: errors
        });

        lastReportTime = now;
    };

    while (stack.length > 0) {
        // console.error(`[ScanJob] Stack size: ${stack.length}`);
        if (signal?.aborted) {
            console.log(`Job ${jobId} cancelled.`);
            eventBus.emit({
                type: 'JobFailed',
                jobId: jobId,
                severity: 'warning',
                reason: 'Cancelled by user'
            });
            reportProgress(undefined, true);
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
                    } else {
                        const ext = extname(fullPath).toLowerCase();
                        if (IMAGE_EXTENSIONS.has(ext)) {
                            // Check if exists
                            const exists = db.prepare('SELECT id FROM assets WHERE original_path = ?').get(fullPath) as { id: string } | undefined;

                            let mediaId = exists?.id;

                            if (!exists) {
                                mediaId = uuidv4();
                                const size = stats.size;
                                const hash = await hashFile(fullPath);
                                const exif = await getExifData(fullPath);
                                const width = exif?.width || 0;
                                const height = exif?.height || 0;
                                const exifDate = new Date(stats.birthtime).toISOString();

                                db.prepare('INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                                    .run(mediaId, fullPath, hash, size, width, height, exifDate, new Date().toISOString());

                                eventBus.emit({
                                    type: 'MediaDiscovered',
                                    mediaId: mediaId,
                                    filePath: fullPath,
                                    width: width,
                                    height: height,
                                    scanSessionId: jobId
                                });
                            } else {
                                // Exists. Check for fatal issues before re-triggering
                                const fatalIssue = db.prepare("SELECT id FROM processing_issues WHERE asset_id = ? AND severity = 'fatal'").get(mediaId);
                                if (fatalIssue) {
                                    console.warn(`[Scanner] Skipping ${fullPath} due to recorded fatal processing issue.`);
                                    processed++;
                                    reportProgress(fullPath);
                                    continue;
                                }

                                // Check if it's incomplete (missing preview or face detection)
                                const dr = db.prepare('SELECT id FROM derived_results WHERE asset_id = ? AND task = ?').get(mediaId, 'face_detection');
                                const assetRecord = db.prepare('SELECT p.path as preview_path, a.width, a.height FROM assets a LEFT JOIN previews p ON a.id = p.asset_id WHERE a.id = ?').get(mediaId) as { preview_path: string | null, width: number, height: number };

                                if (!assetRecord?.preview_path || !dr) {
                                    // Missing critical post-processing, re-emit discovery to trigger pipeline
                                    eventBus.emit({
                                        type: 'MediaDiscovered',
                                        mediaId: mediaId!,
                                        filePath: fullPath,
                                        width: assetRecord.width,
                                        height: assetRecord.height,
                                        scanSessionId: jobId
                                    });
                                }
                            }

                            processed++;
                            reportProgress(fullPath);
                        }
                    }
                } catch (e: any) {
                    console.error(`Error processing ${fullPath}:`, e);
                    errors++;
                    reportProgress(fullPath);
                }
            }
        } catch (e: any) {
            console.error(`Error reading dir ${dir}:`, e);
            errors++;
            eventBus.emit({
                type: 'JobFailed',
                jobId: jobId,
                severity: 'error',
                reason: e.message
            });
        }
    }

    reportProgress(undefined, true); // Final forced report

    eventBus.emit({
        type: 'JobCompleted',
        jobId: jobId
    });
}
