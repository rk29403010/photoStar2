import { existsSync, promises as fs } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'node:path';
import sharp from 'sharp';
import type { DatabaseManager } from '../../data/db';
import type { RowData } from './ai_metadata_shared';

export async function prepareImagePayload(row: RowData): Promise<{
    filename: string;
    exifDataString: string;
    imageBase64: string;
    mimeType: string;
}> {
    const filename = row.original_path.split(/[/\\]/).pop() || '';
    const fileBuffer = await fs.readFile(row.original_path);

    let exifDataString = '';
    try {
        const Parser = (await import('exif-parser')) as typeof import('exif-parser');
        const parser = Parser.create(fileBuffer) as { parse: () => { tags: Record<string, unknown> } };
        exifDataString = JSON.stringify(parser.parse().tags);
    } catch {
        // no EXIF
    }

    try {
        const optimizedBuffer = await sharp(fileBuffer)
            .rotate()
            .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer();
        return { filename, exifDataString, imageBase64: optimizedBuffer.toString('base64'), mimeType: 'image/jpeg' };
    } catch {
        const ext = extname(row.original_path).toLowerCase().replace('.', '') || 'jpeg';
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return { filename, exifDataString, imageBase64: fileBuffer.toString('base64'), mimeType };
    }
}

export function recordErrorIssue(
    db: ReturnType<DatabaseManager['getDb']>,
    row: RowData,
    jobId: string,
    message: string
): void {
    try {
        db.prepare(`
            INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
            VALUES (?, ?, ?, 'ai_metadata', 'warning', ?)
        `).run(uuidv4(), row.id, jobId, message);
    } catch {
        // ignore issue persistence failures
    }
}

export function saveAiMetadataResult(
    db: ReturnType<DatabaseManager['getDb']>,
    row: RowData,
    usedModel: string,
    parsedResult: Record<string, unknown>
): void {
    const existing = db.prepare(`
        SELECT id
        FROM derived_results
        WHERE asset_id = ? AND task = 'ai_metadata'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(row.id) as { id: string } | undefined;

    if (existing) {
        db.prepare(`
            UPDATE derived_results
            SET provider = 'google',
                model_version = ?,
                data = ?,
                created_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(usedModel, JSON.stringify(parsedResult), existing.id);

        db.prepare(`
            DELETE FROM derived_results
            WHERE asset_id = ? AND task = 'ai_metadata' AND id <> ?
        `).run(row.id, existing.id);
        return;
    }

    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'ai_metadata', 'google', ?, ?)
    `).run(uuidv4(), row.id, usedModel, JSON.stringify(parsedResult));
}

export { existsSync };
