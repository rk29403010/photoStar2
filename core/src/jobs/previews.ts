import { DatabaseManager } from '../db';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';

const PREVIEW_SIZES = {
    'thumbnail': 450,
    'large': 1080
};

// Increment this version whenever the thumbnail generation algorithm changes.
// It will invalidate older thumbnails and regenerate them during the next job run.
export const CURRENT_PREVIEW_VERSION = 3;

export async function runPreviewJob(
    mediaIds: string[],
    dbManager: DatabaseManager,
    eventBus: EventBus
) {
    const db = dbManager.getDb();
    const libraryDir = dirname(db.name);
    const previewsDir = join(libraryDir, 'previews');

    if (!existsSync(previewsDir)) {
        mkdirSync(previewsDir, { recursive: true });
    }

    const jobId = `preview-batch-${Date.now()}`;
    const totalItems = mediaIds.length;
    let processed = 0;
    let errors = 0;
    const startTime = Date.now();
    let lastReportTime = startTime;

    eventBus.emit({
        type: 'JobStarted',
        jobId: jobId,
        pipelineStage: 'previews'
    });

    const reportProgress = (currentItemPath?: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastReportTime < 500) return; // Throttle 500ms

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

    // Process provided mediaIds
    for (const mediaId of mediaIds) {
        await waitIfPaused();
        try {
            const asset = db.prepare('SELECT id, original_path FROM assets WHERE id = ?').get(mediaId) as { id: string, original_path: string } | undefined;

            if (!asset) {
                console.warn(`Asset ${mediaId} not found during preview generation`);
                errors++;
                processed++;
                reportProgress();
                continue;
            }

            // Construct expected path
            const thumbPath = join(previewsDir, `${asset.id}-thumbnail.webp`);

            // Check if already has thumbnails matching the current version
            const existing = db.prepare('SELECT count(*) as count FROM previews WHERE asset_id = ? AND version >= ?').get(asset.id, CURRENT_PREVIEW_VERSION) as { count: number };
            if (existing.count >= Object.keys(PREVIEW_SIZES).length) {
                // Already done
                eventBus.emit({
                    type: 'PreviewGenerated',
                    mediaId: asset.id,
                    path: thumbPath
                });
                processed++;
                reportProgress(asset.original_path);
                continue;
            }

            // Generate
            for (const [sizeName, width] of Object.entries(PREVIEW_SIZES)) {
                const filename = `${asset.id}-${sizeName}.webp`;
                const outPath = join(previewsDir, filename);

                // Even if file exists, we regenerate if version mismatch (handled by existing.count check above)
                // BUT we should verify file existence before skipping regenerate
                if (!existsSync(outPath) || existing.count < Object.keys(PREVIEW_SIZES).length) {
                    await sharp(asset.original_path)
                        .rotate() // Respect EXIF orientation
                        .resize(width, null, {
                            withoutEnlargement: true,
                            fit: 'inside'
                        })
                        .webp({ effort: 4, quality: 80 })
                        .toFile(outPath);
                }

                db.prepare(`
                    INSERT OR REPLACE INTO previews (asset_id, size, path, version) 
                    VALUES (?, ?, ?, ?)
                `).run(asset.id, sizeName, outPath, CURRENT_PREVIEW_VERSION);
            }

            eventBus.emit({
                type: 'PreviewGenerated',
                mediaId: asset.id,
                path: thumbPath
            });

            processed++;
            reportProgress(asset.original_path);

        } catch (err: unknown) {
            const e = err as Error;
            console.error(`Failed preview for ${mediaId}:`, e);
            errors++;


            try {
                db.prepare(`
                    INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
                    VALUES (?, ?, ?, 'preview', 'fatal', ?)
                `).run(uuidv4(), mediaId, jobId, e.message);
            } catch (dbErr) {
                console.error('Failed to log processing issue:', dbErr);
            }

            eventBus.emit({
                type: 'PreviewFailed',
                mediaId: mediaId,
                severity: 'error'
            });
            processed++;
            reportProgress();
        }
    }

    reportProgress(undefined, true);

    eventBus.emit({
        type: 'JobCompleted',
        jobId: jobId
    });
}
