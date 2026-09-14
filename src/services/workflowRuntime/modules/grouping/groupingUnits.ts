import type { DatabaseManager } from '../../../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type GroupingAssetRow = {
    id: string;
    originalPath: string;
    fileHash: string | null;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
    phash64: string | null;
    dhash64: string | null;
};

export type SimilarityGroupingMemberEvidence = {
    assetId: string;
    exifDatetime: string | null;
    phash64: string | null;
    dhash64: string | null;
};

export type SimilarityGroupingUnit = {
    unitId: string;
    sourceGroupId: string | null;
    representativeAssetId: string;
    memberAssetIds: string[];
    originalPath: string;
    fileHash: string | null;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
    phash64: string | null;
    dhash64: string | null;
    memberEvidence?: SimilarityGroupingMemberEvidence[];
}

function loadEligibleAssets(db: DbHandle): GroupingAssetRow[] {
    return db.prepare(`
        SELECT
            a.id,
            a.original_path AS originalPath,
            a.file_hash AS fileHash,
            a.file_size AS fileSize,
            a.width,
            a.height,
            a.exif_datetime AS exifDatetime,
            f.phash64,
            f.dhash64
        FROM assets a
        LEFT JOIN asset_features f ON f.asset_id = a.id
        WHERE a.file_hash IS NOT NULL
          AND a.file_size IS NOT NULL
          AND a.width > 0
          AND a.height > 0
    `).all() as GroupingAssetRow[];
}

export function buildRawSimilarityUnits(db: DbHandle): SimilarityGroupingUnit[] {
    return loadEligibleAssets(db).map((asset) => ({
        unitId: `asset:${asset.id}`,
        sourceGroupId: null,
        representativeAssetId: asset.id,
        memberAssetIds: [asset.id],
        originalPath: asset.originalPath,
        fileHash: asset.fileHash,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
        exifDatetime: asset.exifDatetime,
        phash64: asset.phash64,
        dhash64: asset.dhash64,
        memberEvidence: [{
            assetId: asset.id,
            exifDatetime: asset.exifDatetime,
            phash64: asset.phash64,
            dhash64: asset.dhash64,
        }],
    }));
}
