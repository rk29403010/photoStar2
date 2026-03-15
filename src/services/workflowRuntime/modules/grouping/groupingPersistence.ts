import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../data/db';
import type { PreparedGroupingAsset } from './groupingAssetPrep';
import type { BurstGroupingAsset, GroupingSimilarityAsset, GroupingSimilarityEdge } from './groupingQueries';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type GroupableAsset = {
    id: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
};

type DuplicateAssetRow = PreparedGroupingAsset;
type VariantAssetRow = GroupingSimilarityAsset;
type BurstAssetRow = BurstGroupingAsset;

type GroupType = 'duplicate' | 'variant_set' | 'burst';

function sortByCanonicalPriority<T extends GroupableAsset>(assets: T[]): T[] {
    return [...assets].sort((left, right) => {
        const leftArea = left.width * left.height;
        const rightArea = right.width * right.height;
        if (leftArea !== rightArea) {
            return rightArea - leftArea;
        }
        if (left.fileSize !== right.fileSize) {
            return right.fileSize - left.fileSize;
        }
        if (left.exifDatetime && right.exifDatetime && left.exifDatetime !== right.exifDatetime) {
            return left.exifDatetime.localeCompare(right.exifDatetime);
        }
        return left.id.localeCompare(right.id);
    });
}

function findLockedGroup(db: DbHandle, type: GroupType, assetIds: string[]): boolean {
    if (assetIds.length === 0) {
        return false;
    }

    const placeholders = assetIds.map(() => '?').join(', ');
    const lockedGroup = db.prepare(`
        SELECT g.id
        FROM asset_groups g
        JOIN asset_group_members m ON m.group_id = g.id
        WHERE g.type = ?
          AND g.status = 'locked'
          AND m.asset_id IN (${placeholders})
        LIMIT 1
    `).get(type, ...assetIds) as { id: string } | undefined;

    return Boolean(lockedGroup);
}

function clearExistingImpactedGroups(db: DbHandle, type: GroupType, changedAssetIds: string[]): void {
    if (changedAssetIds.length === 0) {
        return;
    }

    const placeholders = changedAssetIds.map(() => '?').join(', ');
    const existingGroups = db.prepare(`
        SELECT DISTINCT g.id
        FROM asset_groups g
        JOIN asset_group_members m ON m.group_id = g.id
        WHERE g.type = ?
          AND g.status != 'locked'
          AND m.asset_id IN (${placeholders})
    `).all(type, ...changedAssetIds) as Array<{ id: string }>;

    for (const group of existingGroups) {
        db.prepare('DELETE FROM asset_group_members WHERE group_id = ?').run(group.id);
        db.prepare('DELETE FROM asset_groups WHERE id = ?').run(group.id);
    }
}

function loadImpactedDuplicateSets(db: DbHandle, changedAssetIds: string[]): DuplicateAssetRow[][] {
    if (changedAssetIds.length === 0) {
        return [];
    }

    const placeholders = changedAssetIds.map(() => '?').join(', ');
    const hashRows = db.prepare(`
        SELECT DISTINCT file_hash
        FROM assets
        WHERE id IN (${placeholders})
          AND file_hash IS NOT NULL
    `).all(...changedAssetIds) as Array<{ file_hash: string }>;

    const duplicateSets: DuplicateAssetRow[][] = [];
    for (const hashRow of hashRows) {
        const assets = db.prepare(`
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
            WHERE a.file_hash = ?
        `).all(hashRow.file_hash) as DuplicateAssetRow[];
        if (assets.length > 1) {
            duplicateSets.push(sortByCanonicalPriority(assets));
        }
    }

    return duplicateSets;
}

function insertDuplicateGroup(db: DbHandle, assets: DuplicateAssetRow[]): void {
    const groupId = uuidv4();
    db.prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, 'duplicate', 'confirmed', ?, '1.0', ?)
    `).run(groupId, assets[0].id, JSON.stringify({ strategy: 'file_hash' }));

    const insertMember = db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    for (const [index, asset] of assets.entries()) {
        insertMember.run(groupId, asset.id, index === 0 ? 'canonical' : 'member', index);
    }
}

function clearVariantEdges(db: DbHandle, assetIds: string[]): void {
    if (assetIds.length === 0) {
        return;
    }

    const placeholders = assetIds.map(() => '?').join(', ');
    db.prepare(`
        DELETE FROM asset_similarity_edges
        WHERE kind = 'visual'
          AND (
            asset_id_a IN (${placeholders})
            OR asset_id_b IN (${placeholders})
          )
    `).run(...assetIds, ...assetIds);
}

function insertVariantEdges(db: DbHandle, edges: GroupingSimilarityEdge[]): void {
    const insertEdge = db.prepare(`
        INSERT OR REPLACE INTO asset_similarity_edges (
            asset_id_a,
            asset_id_b,
            kind,
            score,
            reason,
            algorithm_version
        )
        VALUES (?, ?, 'visual', ?, 'phash', '1.0')
    `);

    for (const edge of edges) {
        insertEdge.run(edge.leftId, edge.rightId, edge.score);
    }
}

function insertVariantGroup(db: DbHandle, assets: VariantAssetRow[], threshold: number): void {
    insertSimilarityGroup(db, {
        type: 'variant_set',
        assets,
        paramsJson: { threshold },
    });
}

function insertBurstGroup(db: DbHandle, assets: BurstAssetRow[], maxSeconds: number, maxDistance: number): void {
    insertSimilarityGroup(db, {
        type: 'burst',
        assets,
        paramsJson: { t_burst: maxSeconds, phashThreshold: maxDistance },
    });
}

function insertSimilarityGroup<T extends GroupableAsset>(db: DbHandle, params: {
    type: 'variant_set' | 'burst';
    assets: T[];
    paramsJson: Record<string, number>;
}): void {
    const orderedAssets = sortByCanonicalPriority(params.assets);
    const groupId = uuidv4();

    db.prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, ?, 'proposed', ?, '1.0', ?)
    `).run(groupId, params.type, orderedAssets[0].id, JSON.stringify(params.paramsJson));

    const insertMember = db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    for (const [index, asset] of orderedAssets.entries()) {
        insertMember.run(groupId, asset.id, index === 0 ? 'canonical' : 'member', index);
    }
}

export function rebuildImpactedDuplicateGroups(params: {
    db: DbHandle;
    changedAssetIds: string[];
}): number {
    if (params.changedAssetIds.length === 0) {
        return 0;
    }

    const duplicateSets = loadImpactedDuplicateSets(params.db, params.changedAssetIds);
    clearExistingImpactedGroups(params.db, 'duplicate', params.changedAssetIds);
    let insertedCount = 0;

    for (const duplicateSet of duplicateSets) {
        if (findLockedGroup(params.db, 'duplicate', duplicateSet.map((asset) => asset.id))) {
            continue;
        }
        insertDuplicateGroup(params.db, duplicateSet);
        insertedCount += 1;
    }

    return insertedCount;
}

export function rebuildImpactedVariantGroups(params: {
    db: DbHandle;
    assets: VariantAssetRow[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
    threshold: number;
}): number {
    if (params.assets.length === 0) {
        return 0;
    }

    const assetIds = params.assets.map((asset) => asset.id);
    const assetById = new Map(params.assets.map((asset) => [asset.id, asset]));
    clearExistingImpactedGroups(params.db, 'variant_set', assetIds);
    clearVariantEdges(params.db, assetIds);
    insertVariantEdges(params.db, params.edges);

    let insertedCount = 0;
    for (const component of params.components) {
        if (findLockedGroup(params.db, 'variant_set', component)) {
            continue;
        }
        const componentAssets = component
            .map((assetId) => assetById.get(assetId))
            .filter((asset): asset is VariantAssetRow => Boolean(asset));
        if (componentAssets.length < 2) {
            continue;
        }
        insertVariantGroup(params.db, componentAssets, params.threshold);
        insertedCount += 1;
    }

    return insertedCount;
}

export function rebuildImpactedBurstGroups(params: {
    db: DbHandle;
    assets: BurstAssetRow[];
    components: string[][];
    maxSeconds: number;
    maxDistance: number;
}): number {
    if (params.assets.length === 0) {
        return 0;
    }

    const assetIds = params.assets.map((asset) => asset.id);
    const assetById = new Map(params.assets.map((asset) => [asset.id, asset]));
    clearExistingImpactedGroups(params.db, 'burst', assetIds);

    let insertedCount = 0;
    for (const component of params.components) {
        if (findLockedGroup(params.db, 'burst', component)) {
            continue;
        }
        const componentAssets = component
            .map((assetId) => assetById.get(assetId))
            .filter((asset): asset is BurstAssetRow => Boolean(asset));
        if (componentAssets.length < 2) {
            continue;
        }
        insertBurstGroup(params.db, componentAssets, params.maxSeconds, params.maxDistance);
        insertedCount += 1;
    }

    return insertedCount;
}
