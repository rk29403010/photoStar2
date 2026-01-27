import { DatabaseManager } from '../db';
import { hashFile, getFileStats, getExifData } from '../file-utils';
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']);

export async function runScanJob(jobId: string, rootPath: string, dbManager: DatabaseManager, sendProgress: (p: any) => void) {
    const db = dbManager.getDb();
    let processed = 0;
    // Use a stack for iterative walk to allow async operations inside
    const stack = [rootPath];

    while (stack.length > 0) {
        const dir = stack.pop()!;
        try {
            const files = readdirSync(dir);
            for (const file of files) {
                const fullPath = join(dir, file);
                try {
                    const stats = statSync(fullPath);
                    if (stats.isDirectory()) {
                        stack.push(fullPath);
                    } else {
                        const ext = require('path').extname(fullPath).toLowerCase();
                        if (IMAGE_EXTENSIONS.has(ext)) {
                            // Check if exists
                            const exists = db.prepare('SELECT id FROM assets WHERE original_path = ?').get(fullPath);

                            if (!exists) {
                                const id = uuidv4();
                                const size = stats.size;

                                // Expensive operations
                                const hash = await hashFile(fullPath);
                                const exif = await getExifData(fullPath);

                                const width = exif?.width || 0;
                                const height = exif?.height || 0;

                                // Simplistic date handling: Use file stats birthtime as fallback since we don't have exif-reader yet
                                // const exifDate = exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toISOString() : new Date(stats.birthtime).toISOString();
                                const exifDate = new Date(stats.birthtime).toISOString();

                                db.prepare('INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                                    .run(id, fullPath, hash, size, width, height, exifDate, new Date().toISOString());
                            }

                            processed++;
                            // Update every file for better feedback
                            sendProgress({ jobId, status: 'running', processed, current: file });
                        }
                    }
                } catch (e: any) {
                    console.error(`Error processing ${fullPath}:`, e);
                    // Optional: send error to UI?
                }
            }
        } catch (e: any) {
            console.error(`Error reading dir ${dir}:`, e);
            sendProgress({ jobId, status: 'error', error: e.message });
        }
    }

    sendProgress({ jobId, status: 'completed', processed });
}
