import type { DatabaseManager } from '../../data/db';
import { selectDuplicateRepresentative } from '../workflowRuntime/modules/grouping/groupingHierarchy';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type ExactDuplicateAssetRow = {
    id: string;
    originalPath: string;
    fileHash: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
};

export type ExactDuplicateSet = {
    key: string;
    contentHash: string;
    representativeAssetId: string;
    assetIds: string[];
    count: number;
};

function loadDuplicateAssetRows(db: DbHandle): ExactDuplicateAssetRow[] {
    return db.prepare(`
        SELECT
            id,
            original_path AS originalPath,
            file_hash AS fileHash,
            COALESCE(file_size, 0) AS fileSize,
            COALESCE(width, 0) AS width,
            COALESCE(height, 0) AS height,
            exif_datetime AS exifDatetime
        FROM assets
        WHERE file_hash IS NOT NULL
          AND file_hash IN (
              SELECT file_hash
              FROM assets
              WHERE file_hash IS NOT NULL
              GROUP BY file_hash
              HAVING COUNT(*) > 1
          )
        ORDER BY file_hash ASC, id ASC
    `).all() as ExactDuplicateAssetRow[];
}

function groupRowsByContentHash(rows: ExactDuplicateAssetRow[]): Map<string, ExactDuplicateAssetRow[]> {
    const grouped = new Map<string, ExactDuplicateAssetRow[]>();
    for (const row of rows) {
        const group = grouped.get(row.fileHash) ?? [];
        group.push(row);
        grouped.set(row.fileHash, group);
    }
    return grouped;
}

/**
 * Deterministic semantic projection for exact file copies.
 *
 * Exact-copy membership comes directly from content digest equivalence rather
 * than persisted pairwise relationships. The legacy `asset_groups` writer
 * remains authoritative for the current UI until the presentation cutover.
 */
export function getExactDuplicateSets(db: DbHandle): ExactDuplicateSet[] {
    const groupedRows = groupRowsByContentHash(loadDuplicateAssetRows(db));

    return [...groupedRows.entries()].map(([contentHash, assets]) => {
        const representative = selectDuplicateRepresentative(assets);
        return {
            key: `exact:${contentHash}`,
            contentHash,
            representativeAssetId: representative.id,
            assetIds: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
            count: assets.length,
        };
    });
}
