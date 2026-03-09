import type { DatabaseManager } from '../db';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';

const PREVIEW_SIZES = {
    'thumbnail': 256,
    'large': 1080
};

// Increment this version whenever the thumbnail generation algorithm changes.
// It will invalidate older thumbnails and regenerate them during the next job run.
export const CURRENT_PREVIEW_VERSION = 4;

function emitProgress(
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

async function generatePreviewVariants(
    db: ReturnType<DatabaseManager['getDb']>,
    previewsDir: string,
    asset: { id: string; original_path: string }
): Promise<void> {
    const existing = db.prepare('SELECT count(*) as count FROM previews WHERE asset_id = ? AND version >= ?')
        .get(asset.id, CURRENT_PREVIEW_VERSION) as { count: number };

    if (existing.count >= Object.keys(PREVIEW_SIZES).length) {return;}

    for (const [sizeName, width] of Object.entries(PREVIEW_SIZES)) {
        const outPath = join(previewsDir, `${asset.id}-${sizeName}.webp`);
        if (!existsSync(outPath) || existing.count < Object.keys(PREVIEW_SIZES).length) {
            await sharp(asset.original_path)
                .rotate()
                .resize(width, null, { withoutEnlargement: true, fit: 'inside' })
                .webp({ effort: 4, quality: 80 })
                .toFile(outPath);
        }

        db.prepare(`
            INSERT OR REPLACE INTO previews (asset_id, size, path, version) 
            VALUES (?, ?, ?, ?)
        `).run(asset.id, sizeName, outPath, CURRENT_PREVIEW_VERSION);
    }
}

async function processMediaPreview(
    mediaId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    jobId: string,
    previewsDir: string
): Promise<{ processed: number; errors: number; currentItemPath?: string }> {
    const db = dbManager.getDb();
    const asset = db.prepare('SELECT id, original_path FROM assets WHERE id = ?').get(mediaId) as { id: string; original_path: string } | undefined;

    if (!asset) {
        console.warn(`Asset ${mediaId} not found during preview generation`);
        return { processed: 1, errors: 1 };
    }

    try {
        await generatePreviewVariants(db, previewsDir, asset);
        eventBus.emit({
            type: 'PreviewGenerated',
            mediaId: asset.id,
            path: join(previewsDir, `${asset.id}-thumbnail.webp`)
        });
        return { processed: 1, errors: 0, currentItemPath: asset.original_path };
    } catch (err: unknown) {
        const e = err as Error;
        console.error(`Failed preview for ${mediaId}:`, e);
        try {
            db.prepare(`
                INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
                VALUES (?, ?, ?, 'preview', 'fatal', ?)
            `).run(uuidv4(), mediaId, jobId, e.message);
        } catch (dbErr) {
            console.error('Failed to log processing issue:', dbErr);
        }
        eventBus.emit({ type: 'PreviewFailed', mediaId, severity: 'error' });
        return { processed: 1, errors: 1 };
    }
}

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
        jobId,
        pipelineStage: 'previews'
    });

    for (const mediaId of mediaIds) {
        await waitIfPaused();
        const result = await processMediaPreview(mediaId, dbManager, eventBus, jobId, previewsDir);
        processed += result.processed;
        errors += result.errors;
        lastReportTime = emitProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, result.currentItemPath);
    }

    emitProgress(eventBus, jobId, processed, totalItems, errors, startTime, lastReportTime, undefined, true);

    eventBus.emit({
        type: 'JobCompleted',
        jobId
    });
}
