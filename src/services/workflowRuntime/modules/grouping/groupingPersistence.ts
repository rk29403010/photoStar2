import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../data/db';
import type { PreparedGroupingAsset } from './groupingAssetPrep';
import type { GroupingSimilarityEdge } from './groupingQueries';
import type { SimilarityGroupingUnit } from './groupingUnits';
import {
    selectBurstRepresentative,
    selectDuplicateRepresentative,
    selectNearDuplicateRepresentative,
    selectVariantRepresentative,
} from './groupingHierarchy';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type GroupableAsset = {
    id: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
};

type DuplicateAssetRow = PreparedGroupingAsset;
type NearDuplicateUnitRow = SimilarityGroupingUnit;
type VariantUnitRow = SimilarityGroupingUnit;
type BurstUnitRow = SimilarityGroupingUnit;

type GroupType = 'duplicate' | 'near_duplicate' | 'variant_set' | 'burst';
type ChildGroupRecord = {
    groupId: string;
    assetIds: string[];
};

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
    const canonicalAsset = selectDuplicateRepresentative(assets);
    db.prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, 'duplicate', 'confirmed', ?, '1.0', ?)
    `).run(groupId, canonicalAsset.id, JSON.stringify({ strategy: 'file_hash' }));

    const insertMember = db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    const orderedAssets = sortByCanonicalPriority(assets);
    const canonicalIndex = orderedAssets.findIndex((asset) => asset.id === canonicalAsset.id);
    if (canonicalIndex > 0) {
        const [selectedCanonical] = orderedAssets.splice(canonicalIndex, 1);
        if (selectedCanonical) {
            orderedAssets.unshift(selectedCanonical);
        }
    }

    for (const [index, asset] of orderedAssets.entries()) {
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

function insertVariantGroup(db: DbHandle, units: VariantUnitRow[], threshold: number): void {
    insertSimilarityGroup(db, {
        canonicalAssetId: selectVariantRepresentative(units.map((unit) => ({
            id: unit.representativeAssetId,
            originalPath: unit.originalPath,
            fileSize: unit.fileSize,
            width: unit.width,
            height: unit.height,
            exifDatetime: unit.exifDatetime,
        }))).id,
        childGroups: units
            .filter((unit) => unit.sourceGroupId)
            .map((unit) => ({
                groupId: unit.sourceGroupId!,
                assetIds: unit.memberAssetIds,
            })),
        type: 'variant_set',
        assets: units
            .filter((unit) => unit.sourceGroupId === null)
            .map((unit) => ({
                id: unit.representativeAssetId,
                fileSize: unit.fileSize,
                width: unit.width,
                height: unit.height,
                exifDatetime: unit.exifDatetime,
            })),
        paramsJson: { threshold },
    });
}

function insertNearDuplicateGroup(db: DbHandle, units: NearDuplicateUnitRow[], threshold: number): void {
    insertSimilarityGroup(db, {
        canonicalAssetId: selectNearDuplicateRepresentative(units.map((unit) => ({
            id: unit.representativeAssetId,
            originalPath: unit.originalPath,
            fileSize: unit.fileSize,
            width: unit.width,
            height: unit.height,
            exifDatetime: unit.exifDatetime,
        }))).id,
        childGroups: units
            .filter((unit) => unit.sourceGroupId)
            .map((unit) => ({
                groupId: unit.sourceGroupId!,
                assetIds: unit.memberAssetIds,
            })),
        type: 'near_duplicate',
        assets: units
            .filter((unit) => unit.sourceGroupId === null)
            .map((unit) => ({
                id: unit.representativeAssetId,
                fileSize: unit.fileSize,
                width: unit.width,
                height: unit.height,
                exifDatetime: unit.exifDatetime,
            })),
        paramsJson: { threshold },
    });
}

function insertBurstGroup(db: DbHandle, units: BurstUnitRow[], maxSeconds: number, maxDistance: number): void {
    insertSimilarityGroup(db, {
        canonicalAssetId: selectBurstRepresentative(units.map((unit) => ({
            id: unit.representativeAssetId,
            originalPath: unit.originalPath,
            fileSize: unit.fileSize,
            width: unit.width,
            height: unit.height,
            exifDatetime: unit.exifDatetime,
        }))).id,
        childGroups: units
            .filter((unit) => unit.sourceGroupId)
            .map((unit) => ({
                groupId: unit.sourceGroupId!,
                assetIds: unit.memberAssetIds,
            })),
        type: 'burst',
        assets: units
            .filter((unit) => unit.sourceGroupId === null)
            .map((unit) => ({
                id: unit.representativeAssetId,
                fileSize: unit.fileSize,
                width: unit.width,
                height: unit.height,
                exifDatetime: unit.exifDatetime,
            })),
        paramsJson: { t_burst: maxSeconds, phashThreshold: maxDistance },
    });
}

function insertSimilarityGroup<T extends GroupableAsset>(db: DbHandle, params: {
    canonicalAssetId: string;
    childGroups: ChildGroupRecord[];
    type: 'near_duplicate' | 'variant_set' | 'burst';
    assets: T[];
    paramsJson: Record<string, number>;
}): void {
    const orderedAssets = sortByCanonicalPriority(params.assets);
    const groupId = uuidv4();
    const childAssetIds = new Set(params.childGroups.flatMap((childGroup) => childGroup.assetIds));

    db.prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, ?, 'proposed', ?, '1.0', ?)
    `).run(groupId, params.type, params.canonicalAssetId, JSON.stringify(params.paramsJson));

    const insertMember = db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);
    const insertChild = db.prepare(`
        INSERT INTO asset_group_children (parent_group_id, child_group_id, rank)
        VALUES (?, ?, ?)
    `);

    const directAssets = orderedAssets.filter((asset) => !childAssetIds.has(asset.id));

    const canonicalIndex = directAssets.findIndex((asset) => asset.id === params.canonicalAssetId);
    if (canonicalIndex > 0) {
        const [selectedCanonical] = directAssets.splice(canonicalIndex, 1);
        if (selectedCanonical) {
            directAssets.unshift(selectedCanonical);
        }
    }

    for (const [index, asset] of directAssets.entries()) {
        insertMember.run(groupId, asset.id, index === 0 ? 'canonical' : 'member', index);
    }

    for (const [index, childGroup] of params.childGroups.entries()) {
        insertChild.run(groupId, childGroup.groupId, index);
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
    units: VariantUnitRow[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
    threshold: number;
}): number {
    if (params.units.length === 0) {
        return 0;
    }

    const assetIds = [...new Set(params.units.flatMap((unit) => unit.memberAssetIds))];
    const unitById = new Map(params.units.map((unit) => [unit.unitId, unit]));
    clearExistingImpactedGroups(params.db, 'variant_set', assetIds);
    clearVariantEdges(params.db, assetIds);
    insertVariantEdges(params.db, params.edges.flatMap((edge) => {
        const leftUnit = unitById.get(edge.leftId);
        const rightUnit = unitById.get(edge.rightId);
        if (!leftUnit || !rightUnit) {
            return [];
        }

        return [{
            ...edge,
            leftId: leftUnit.representativeAssetId,
            rightId: rightUnit.representativeAssetId,
        }];
    }));

    let insertedCount = 0;
    for (const component of params.components) {
        const componentUnits = component
            .map((unitId) => unitById.get(unitId))
            .filter((unit): unit is VariantUnitRow => Boolean(unit));
        const componentAssetIds = [...new Set(componentUnits.flatMap((unit) => unit.memberAssetIds))];
        if (findLockedGroup(params.db, 'variant_set', componentAssetIds)) {
            continue;
        }
        if (componentUnits.length < 2) {
            continue;
        }
        insertVariantGroup(params.db, componentUnits, params.threshold);
        insertedCount += 1;
    }

    return insertedCount;
}

export function rebuildImpactedNearDuplicateGroups(params: {
    db: DbHandle;
    units: NearDuplicateUnitRow[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
    threshold: number;
}): number {
    if (params.units.length === 0) {
        return 0;
    }

    const assetIds = [...new Set(params.units.flatMap((unit) => unit.memberAssetIds))];
    const unitById = new Map(params.units.map((unit) => [unit.unitId, unit]));
    clearExistingImpactedGroups(params.db, 'near_duplicate', assetIds);
    clearVariantEdges(params.db, assetIds);
    insertVariantEdges(params.db, params.edges.flatMap((edge) => {
        const leftUnit = unitById.get(edge.leftId);
        const rightUnit = unitById.get(edge.rightId);
        if (!leftUnit || !rightUnit) {
            return [];
        }

        return [{
            ...edge,
            leftId: leftUnit.representativeAssetId,
            rightId: rightUnit.representativeAssetId,
        }];
    }));

    let insertedCount = 0;
    for (const component of params.components) {
        const componentUnits = component
            .map((unitId) => unitById.get(unitId))
            .filter((unit): unit is NearDuplicateUnitRow => Boolean(unit));
        const componentAssetIds = [...new Set(componentUnits.flatMap((unit) => unit.memberAssetIds))];
        if (findLockedGroup(params.db, 'near_duplicate', componentAssetIds)) {
            continue;
        }
        if (componentUnits.length < 2) {
            continue;
        }
        insertNearDuplicateGroup(params.db, componentUnits, params.threshold);
        insertedCount += 1;
    }

    return insertedCount;
}

export function rebuildImpactedBurstGroups(params: {
    db: DbHandle;
    units: BurstUnitRow[];
    components: string[][];
    maxSeconds: number;
    maxDistance: number;
}): number {
    if (params.units.length === 0) {
        return 0;
    }

    const assetIds = [...new Set(params.units.flatMap((unit) => unit.memberAssetIds))];
    const unitById = new Map(params.units.map((unit) => [unit.unitId, unit]));
    clearExistingImpactedGroups(params.db, 'burst', assetIds);

    let insertedCount = 0;
    for (const component of params.components) {
        const componentUnits = component
            .map((unitId) => unitById.get(unitId))
            .filter((unit): unit is BurstUnitRow => Boolean(unit));
        const componentAssetIds = [...new Set(componentUnits.flatMap((unit) => unit.memberAssetIds))];
        if (findLockedGroup(params.db, 'burst', componentAssetIds)) {
            continue;
        }
        if (componentUnits.length < 2) {
            continue;
        }
        insertBurstGroup(params.db, componentUnits, params.maxSeconds, params.maxDistance);
        insertedCount += 1;
    }

    return insertedCount;
}
