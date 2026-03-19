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
    phash64: string;
    dhash64: string;
};

export interface SimilarityGroupingUnit {
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
    phash64: string;
    dhash64: string;
}

type SimilarityGroupRow = {
    groupId: string;
    canonicalAssetId: string;
    originalPath: string;
    fileHash: string | null;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
    phash64: string | null;
    dhash64: string | null;
};

type SimilarityGroupTreeRecord = SimilarityGroupRow & {
    directAssetIds: string[];
    childGroupIds: string[];
};

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
        JOIN asset_features f ON f.asset_id = a.id
        WHERE a.file_hash IS NOT NULL
          AND a.file_size IS NOT NULL
          AND a.width > 0
          AND a.height > 0
          AND f.phash64 IS NOT NULL
          AND f.dhash64 IS NOT NULL
    `).all() as GroupingAssetRow[];
}

function loadSimilarityGroupRows(db: DbHandle, groupTypes: string[]): SimilarityGroupRow[] {
    if (groupTypes.length === 0) {
        return [];
    }

    const placeholders = groupTypes.map(() => '?').join(', ');
    return db.prepare(`
        SELECT
            g.id AS groupId,
            g.canonical_asset_id AS canonicalAssetId,
            a.original_path AS originalPath,
            a.file_hash AS fileHash,
            a.file_size AS fileSize,
            a.width,
            a.height,
            a.exif_datetime AS exifDatetime,
            f.phash64,
            f.dhash64
        FROM asset_groups g
        JOIN assets a ON a.id = g.canonical_asset_id
        LEFT JOIN asset_features f ON f.asset_id = g.canonical_asset_id
        WHERE g.type IN (${placeholders})
          AND g.canonical_asset_id IS NOT NULL
          AND a.file_size IS NOT NULL
          AND a.width > 0
          AND a.height > 0
          AND f.phash64 IS NOT NULL
          AND f.dhash64 IS NOT NULL
    `).all(...groupTypes) as SimilarityGroupRow[];
}

function loadGroupDirectAssetIds(db: DbHandle, groupIds: string[]): Map<string, string[]> {
    const directAssetIdsByGroupId = new Map<string, string[]>();
    if (groupIds.length === 0) {
        return directAssetIdsByGroupId;
    }

    const placeholders = groupIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT group_id AS groupId, asset_id AS assetId
        FROM asset_group_members
        WHERE group_id IN (${placeholders})
        ORDER BY group_id ASC, COALESCE(rank, 999999), asset_id ASC
    `).all(...groupIds) as Array<{ groupId: string; assetId: string }>;

    for (const row of rows) {
        const assetIds = directAssetIdsByGroupId.get(row.groupId) ?? [];
        assetIds.push(row.assetId);
        directAssetIdsByGroupId.set(row.groupId, assetIds);
    }

    return directAssetIdsByGroupId;
}

function loadChildGroupIds(db: DbHandle, groupIds: string[]): Map<string, string[]> {
    const childGroupIdsByGroupId = new Map<string, string[]>();
    if (groupIds.length === 0) {
        return childGroupIdsByGroupId;
    }

    const placeholders = groupIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT parent_group_id AS parentGroupId, child_group_id AS childGroupId
        FROM asset_group_children
        WHERE parent_group_id IN (${placeholders})
        ORDER BY parent_group_id ASC, COALESCE(rank, 999999), child_group_id ASC
    `).all(...groupIds) as Array<{ parentGroupId: string; childGroupId: string }>;

    for (const row of rows) {
        const childGroupIds = childGroupIdsByGroupId.get(row.parentGroupId) ?? [];
        childGroupIds.push(row.childGroupId);
        childGroupIdsByGroupId.set(row.parentGroupId, childGroupIds);
    }

    return childGroupIdsByGroupId;
}

function buildDescendantAssetIds(
    groupId: string,
    groupsById: Map<string, SimilarityGroupTreeRecord>,
    descendantAssetIdsByGroupId: Map<string, string[]>,
): string[] {
    const cachedAssetIds = descendantAssetIdsByGroupId.get(groupId);
    if (cachedAssetIds) {
        return cachedAssetIds;
    }

    const group = groupsById.get(groupId);
    if (!group) {
        return [];
    }

    const descendantAssetIds = [
        ...group.directAssetIds,
        ...group.childGroupIds.flatMap((childGroupId) => (
            buildDescendantAssetIds(childGroupId, groupsById, descendantAssetIdsByGroupId)
        )),
    ];
    const uniqueAssetIds = [...new Set(descendantAssetIds)];
    descendantAssetIdsByGroupId.set(groupId, uniqueAssetIds);
    return uniqueAssetIds;
}

function collectNestedGroupIds(
    groupId: string,
    groupsById: Map<string, SimilarityGroupTreeRecord>,
    nestedGroupIds: Set<string>,
): void {
    const group = groupsById.get(groupId);
    if (!group) {
        return;
    }

    for (const childGroupId of group.childGroupIds) {
        if (nestedGroupIds.has(childGroupId)) {
            continue;
        }
        nestedGroupIds.add(childGroupId);
        collectNestedGroupIds(childGroupId, groupsById, nestedGroupIds);
    }
}

function buildTopLevelGroupingUnits(db: DbHandle, groupTypes: string[]): SimilarityGroupingUnit[] {
    const groupRows = loadSimilarityGroupRows(db, groupTypes);
    const groupIds = groupRows.map((group) => group.groupId);
    const directAssetIdsByGroupId = loadGroupDirectAssetIds(db, groupIds);
    const childGroupIdsByGroupId = loadChildGroupIds(db, groupIds);
    const groupsById = new Map(groupRows.map((group) => [group.groupId, {
        ...group,
        directAssetIds: directAssetIdsByGroupId.get(group.groupId) ?? [],
        childGroupIds: childGroupIdsByGroupId.get(group.groupId) ?? [],
    }]));
    const descendantAssetIdsByGroupId = new Map<string, string[]>();
    const nestedGroupIds = new Set<string>();

    for (const groupRow of groupRows) {
        buildDescendantAssetIds(groupRow.groupId, groupsById, descendantAssetIdsByGroupId);
        collectNestedGroupIds(groupRow.groupId, groupsById, nestedGroupIds);
    }

    return groupRows
        .filter((group) => !nestedGroupIds.has(group.groupId))
        .map((group) => ({
            unitId: `group:${group.groupId}`,
            sourceGroupId: group.groupId,
            representativeAssetId: group.canonicalAssetId,
            memberAssetIds: descendantAssetIdsByGroupId.get(group.groupId) ?? [],
            originalPath: group.originalPath,
            fileHash: group.fileHash,
            fileSize: group.fileSize,
            width: group.width,
            height: group.height,
            exifDatetime: group.exifDatetime,
            phash64: group.phash64 ?? '',
            dhash64: group.dhash64 ?? '',
        }));
}

function buildDirectAssetUnits(db: DbHandle, excludedAssetIds: Set<string>): SimilarityGroupingUnit[] {
    return loadEligibleAssets(db)
        .filter((asset) => !excludedAssetIds.has(asset.id))
        .map((asset) => ({
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
        }));
}

export function buildSimilarityUnits(db: DbHandle, groupTypes: string[]): SimilarityGroupingUnit[] {
    const topLevelGroupUnits = buildTopLevelGroupingUnits(db, groupTypes);
    const representedAssetIds = new Set(topLevelGroupUnits.flatMap((unit) => unit.memberAssetIds));
    return [
        ...topLevelGroupUnits,
        ...buildDirectAssetUnits(db, representedAssetIds),
    ];
}
