import { DatabaseManager } from '../db';
import { join, dirname, extname, basename } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const PREVIEW_SIZES = {
    'thumbnail': 256,
    'large': 1024
};

export async function runPreviewJob(jobId: string, dbManager: DatabaseManager, sendProgress: (p: any) => void) {
    const db = dbManager.getDb();

    // Determine storage path for previews relative to DB (or APP_DATA_DIR)
    // For specific requirement "Local cache directory". 
    // We'll put it in 'previews' sibling to library.db
    const libraryDir = dirname(db.name);
    const previewsDir = join(libraryDir, 'previews');
    if (!existsSync(previewsDir)) {
        mkdirSync(previewsDir, { recursive: true });
    }

    try {
        // Fetch all assets that need previews (simplistic: process all for now, or check missing)
        // Ideally we check `LEFT JOIN previews` but for MVP let's just find assets
        const assets = db.prepare('SELECT id, original_path FROM assets').all() as { id: string, original_path: string }[];

        let processed = 0;
        const total = assets.length;

        for (const asset of assets) {
            try {
                // Check if already has thumbnails (simple check)
                const existing = db.prepare('SELECT count(*) as count FROM previews WHERE asset_id = ?').get(asset.id) as any;
                if (existing.count >= Object.keys(PREVIEW_SIZES).length) {
                    processed++;
                    continue;
                }

                // Generate
                for (const [sizeName, width] of Object.entries(PREVIEW_SIZES)) {
                    const filename = `${asset.id}-${sizeName}.jpg`;
                    const outPath = join(previewsDir, filename);

                    if (!existsSync(outPath)) {
                        await sharp(asset.original_path)
                            .resize(width, width, { fit: 'inside', withoutEnlargement: true })
                            .jpeg({ quality: 80 })
                            .toFile(outPath);
                    }

                    // Insert record
                    db.prepare(`
                        INSERT OR REPLACE INTO previews (asset_id, size, path, version) 
                        VALUES (?, ?, ?, ?)
                    `).run(asset.id, sizeName, outPath, 1);
                }

                processed++;
                if (processed % 5 === 0) {
                    sendProgress({ jobId, status: 'running', processed, total, current: basename(asset.original_path) });
                }

            } catch (e) {
                console.error(`Failed preview for ${asset.id}:`, e);
            }
        }

        sendProgress({ jobId, status: 'completed', processed, total });

    } catch (e: any) {
        sendProgress({ jobId, status: 'failed', error: e.message });
    }
}
