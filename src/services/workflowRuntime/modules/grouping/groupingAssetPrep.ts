import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import type { DatabaseManager } from '../../../../data/db';
import { getFileStats, hashFile } from '../../../file-utils';
import { blockhashData, dhashData } from '../../../math-utils';
import { persistAssetEmbeddedMetadata } from '../../../embeddedMetadata';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type GroupingAssetRow = {
    id: string;
    original_path: string;
    file_hash: string | null;
    file_size: number | null;
    width: number | null;
    height: number | null;
    exif_datetime: string | null;
    metadata_timestamp_source: string | null;
    phash64: string | null;
    dhash64: string | null;
};

export type PreparedGroupingAsset = {
    id: string;
    originalPath: string;
    fileHash: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
    metadataTimestampSource: string | null;
    phash64: string;
    dhash64: string;
}

const UPSERT_ASSET_FEATURES_SQL = `
    INSERT INTO asset_features (asset_id, file_hash, phash64, dhash64)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
        file_hash = excluded.file_hash,
        phash64 = excluded.phash64,
        dhash64 = excluded.dhash64,
        updated_at = CURRENT_TIMESTAMP
`;

function loadGroupingAssets(db: DbHandle, assetIds: string[]): GroupingAssetRow[] {
    const placeholders = assetIds.map(() => '?').join(', ');
    return db.prepare(`
        SELECT
            a.id,
            a.original_path,
            a.file_hash,
            a.file_size,
            a.width,
            a.height,
            a.exif_datetime,
            a.metadata_timestamp_source,
            f.phash64,
            f.dhash64
        FROM assets a
        LEFT JOIN asset_features f ON f.asset_id = a.id
        WHERE a.id IN (${placeholders})
    `).all(...assetIds) as GroupingAssetRow[];
}

function needsAssetUpdate(row: GroupingAssetRow): boolean {
    return !row.file_hash
        || !row.width
        || !row.height
        || !row.file_size;
}

function needsFeatureUpdate(row: GroupingAssetRow): boolean {
    return !row.phash64 || !row.dhash64;
}

async function computePerceptualHashes(filePath: string): Promise<{ phash64: string; dhash64: string }> {
    const { data: pData } = await sharp(filePath)
        .resize(8, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { data: dData } = await sharp(filePath)
        .resize(9, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        phash64: blockhashData(pData, 8),
        dhash64: await dhashData(dData, 9, 8),
    };
}

function recordProcessingIssue(db: DbHandle, assetId: string, message: string, details?: string): void {
    db.prepare(`
        INSERT INTO processing_issues (id, asset_id, task, severity, message, details)
        VALUES (?, ?, 'grouping', 'warning', ?, ?)
    `).run(uuidv4(), assetId, message, details ?? null);
}

function resolvePositiveNumber(currentValue: number | null, fallbackValue: number): number {
    return currentValue && currentValue > 0 ? currentValue : fallbackValue;
}

async function updateAssetPrerequisites(db: DbHandle, row: GroupingAssetRow): Promise<void> {
    const stats = getFileStats(row.original_path);
    const fileHash = row.file_hash ?? await hashFile(row.original_path);
    const fileSize = resolvePositiveNumber(row.file_size, stats.size);

    db.prepare(`
        UPDATE assets
        SET file_hash = ?,
            file_size = ?
        WHERE id = ?
    `).run(fileHash, fileSize, row.id);
    await persistAssetEmbeddedMetadata({
        db,
        assetId: row.id,
        originalPath: row.original_path,
        fileSize,
        birthtime: stats.birthtime,
    });
}

async function updateFeaturePrerequisites(db: DbHandle, row: GroupingAssetRow): Promise<void> {
    const assetHash = row.file_hash ?? await hashFile(row.original_path);
    const hashes = await computePerceptualHashes(row.original_path);
    db.prepare(UPSERT_ASSET_FEATURES_SQL)
        .run(row.id, assetHash, hashes.phash64, hashes.dhash64);
}

function hasReadyGroupingValues(row: GroupingAssetRow): row is GroupingAssetRow & {
    file_hash: string;
    file_size: number;
    width: number;
    height: number;
    phash64: string;
    dhash64: string;
} {
    return Boolean(
        row.file_hash
        && row.file_size
        && row.width
        && row.height
        && row.phash64
        && row.dhash64,
    );
}

export async function ensureGroupingPrerequisites(params: {
    db: DbHandle;
    assetIds: string[];
}): Promise<PreparedGroupingAsset[]> {
    if (params.assetIds.length === 0) {
        return [];
    }

    const initialRows = loadGroupingAssets(params.db, params.assetIds);

    for (const row of initialRows) {
        try {
            if (needsAssetUpdate(row)) {
                await updateAssetPrerequisites(params.db, row);
            }
            if (needsFeatureUpdate(row)) {
                await updateFeaturePrerequisites(params.db, row);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown grouping preparation failure';
            recordProcessingIssue(params.db, row.id, 'Failed to prepare grouping prerequisites.', message);
        }
    }

    return loadGroupingAssets(params.db, params.assetIds)
        .filter(hasReadyGroupingValues)
        .map((row) => ({
            id: row.id,
            originalPath: row.original_path,
            fileHash: row.file_hash,
            fileSize: row.file_size,
            width: row.width,
            height: row.height,
            exifDatetime: row.exif_datetime,
            metadataTimestampSource: row.metadata_timestamp_source,
            phash64: row.phash64,
            dhash64: row.dhash64,
        }));
}
