import type { DatabaseManager } from '../../data/db';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { blockhashData, dhashData } from '../math-utils'; // Need to implement these or import a library
import sharp from 'sharp';

export async function runComputeHashesJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    const db = dbManager.getDb();

    eventBus.emit({
        type: 'JobStarted',
        jobId,
        pipelineStage: 'similarity_cluster'
    });

    // Find assets that don't have features yet
    const assets = db.prepare(`
        SELECT id, original_path, file_hash 
        FROM assets 
        WHERE id NOT IN (SELECT asset_id FROM asset_features)
    `).all() as { id: string, original_path: string, file_hash: string | null }[];

    if (assets.length === 0) {
        eventBus.emit({
            type: 'JobCompleted',
            jobId,
            pipelineStage: 'similarity_cluster'
        });
        return;
    }

    let processed = 0;
    let errors = 0;

    const insertFeature = db.prepare(`
        INSERT INTO asset_features (asset_id, file_hash, phash64, dhash64)
        VALUES (?, ?, ?, ?)
    `);

    for (const asset of assets) {
        if (signal?.aborted) {break;}
        await waitIfPaused();

        try {
            // Resize image to small grayscale for hashing
            // Resize image to small grayscale for hashing
            // blockhash (aHash) typically uses 8x8 -> 64 bits
            // dhash typically uses 9x8 -> 64 bits
            const { data: pData } = await sharp(asset.original_path)
                .resize(8, 8, { fit: 'fill' })
                .greyscale()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const { data: dData } = await sharp(asset.original_path)
                .resize(9, 8, { fit: 'fill' }) // 9x8 for dhash
                .greyscale()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const pHash = blockhashData(pData, 8); // Bits=8 means 8x8 block
            const dHash = await dhashData(dData, 9, 8); // dhash expects 9x8

            insertFeature.run(asset.id, asset.file_hash, pHash, dHash);

            processed++;
        } catch (err: unknown) {
            console.error(`Failed to hash ${asset.original_path}:`, err);
            errors++;
        }

        if (processed % 10 === 0) {
            eventBus.emit({
                type: 'JobProgress',
                jobId,
                processedItems: processed,
                totalItems: assets.length,
                errorCount: errors
            });
        }
    }

    eventBus.emit({
        type: 'JobCompleted',
        jobId,
        pipelineStage: 'similarity_cluster'
    });
}
