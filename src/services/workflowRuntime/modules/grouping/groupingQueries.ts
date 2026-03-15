import type { DatabaseManager } from '../../../../data/db';
import { hammingDistance } from '../../../math-utils';
import { buildConnectedComponents, type SimilarityEdgeRef } from './groupingGraph';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export interface GroupingSimilarityAsset {
    id: string;
    originalPath: string;
    fileHash: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
    phash64: string;
    dhash64: string;
}

export interface GroupingSimilarityEdge extends SimilarityEdgeRef {
    score: number;
    distance: number;
}

export interface BurstGroupingAsset {
    id: string;
    originalPath: string;
    fileHash: string | null;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string;
    phash64: string | null;
    dhash64: string | null;
}

function loadDuplicateMemberIds(db: DbHandle): Set<string> {
    const rows = db.prepare(`
        SELECT DISTINCT m.asset_id
        FROM asset_group_members m
        JOIN asset_groups g ON g.id = m.group_id
        WHERE g.type = 'duplicate'
    `).all() as Array<{ asset_id: string }>;
    return new Set(rows.map((row) => row.asset_id));
}

function loadVariantEligibleAssets(db: DbHandle): GroupingSimilarityAsset[] {
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
    `).all() as GroupingSimilarityAsset[];
}

function collectReachableVariantAssetIds(
    assets: GroupingSimilarityAsset[],
    changedAssetIds: string[],
    threshold: number,
): Set<string> {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const visited = new Set<string>();
    const frontier: string[] = [];

    for (const assetId of changedAssetIds) {
        if (!byId.has(assetId)) {
            continue;
        }
        visited.add(assetId);
        frontier.push(assetId);
    }

    while (frontier.length > 0) {
        const currentId = frontier.shift();
        if (!currentId) {
            continue;
        }
        const current = byId.get(currentId);
        if (!current) {
            continue;
        }

        for (const candidate of assets) {
            if (candidate.id === current.id) {
                continue;
            }
            const distance = hammingDistance(current.phash64, candidate.phash64);
            if (distance > threshold) {
                continue;
            }
            if (visited.has(candidate.id)) {
                continue;
            }
            visited.add(candidate.id);
            frontier.push(candidate.id);
        }
    }

    return visited;
}

function buildVariantEdges(assets: GroupingSimilarityAsset[], threshold: number): GroupingSimilarityEdge[] {
    const edges: GroupingSimilarityEdge[] = [];

    for (let index = 0; index < assets.length; index += 1) {
        const current = assets[index];
        for (let candidateIndex = index + 1; candidateIndex < assets.length; candidateIndex += 1) {
            const candidate = assets[candidateIndex];
            const distance = hammingDistance(current.phash64, candidate.phash64);
            if (distance > threshold) {
                continue;
            }
            const [leftId, rightId] = current.id.localeCompare(candidate.id) <= 0
                ? [current.id, candidate.id]
                : [candidate.id, current.id];
            edges.push({
                leftId,
                rightId,
                distance,
                score: 1 - (distance / 64),
            });
        }
    }

    return edges;
}

function loadBurstEligibleAssets(db: DbHandle): BurstGroupingAsset[] {
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
        WHERE a.file_size IS NOT NULL
          AND a.width > 0
          AND a.height > 0
          AND a.exif_datetime IS NOT NULL
    `).all() as BurstGroupingAsset[];
}

function isBurstMatch(
    left: BurstGroupingAsset,
    right: BurstGroupingAsset,
    maxSeconds: number,
    maxDistance: number,
): boolean {
    const leftTime = new Date(left.exifDatetime).getTime();
    const rightTime = new Date(right.exifDatetime).getTime();
    const diffSeconds = Math.abs(rightTime - leftTime) / 1000;
    if (diffSeconds > maxSeconds) {
        return false;
    }
    if (!left.phash64 || !right.phash64) {
        return true;
    }
    return hammingDistance(left.phash64, right.phash64) <= maxDistance;
}

function collectReachableBurstAssetIds(
    assets: BurstGroupingAsset[],
    changedAssetIds: string[],
    maxSeconds: number,
    maxDistance: number,
): Set<string> {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const visited = new Set<string>();
    const frontier: string[] = [];

    for (const assetId of changedAssetIds) {
        if (!byId.has(assetId)) {
            continue;
        }
        visited.add(assetId);
        frontier.push(assetId);
    }

    while (frontier.length > 0) {
        const currentId = frontier.shift();
        if (!currentId) {
            continue;
        }
        const current = byId.get(currentId);
        if (!current) {
            continue;
        }

        for (const candidate of assets) {
            if (candidate.id === current.id) {
                continue;
            }
            if (!isBurstMatch(current, candidate, maxSeconds, maxDistance)) {
                continue;
            }
            if (visited.has(candidate.id)) {
                continue;
            }
            visited.add(candidate.id);
            frontier.push(candidate.id);
        }
    }

    return visited;
}

function buildBurstEdges(
    assets: BurstGroupingAsset[],
    maxSeconds: number,
    maxDistance: number,
): GroupingSimilarityEdge[] {
    const edges: GroupingSimilarityEdge[] = [];

    for (let index = 0; index < assets.length; index += 1) {
        const current = assets[index];
        for (let candidateIndex = index + 1; candidateIndex < assets.length; candidateIndex += 1) {
            const candidate = assets[candidateIndex];
            if (!isBurstMatch(current, candidate, maxSeconds, maxDistance)) {
                continue;
            }
            const [leftId, rightId] = current.id.localeCompare(candidate.id) <= 0
                ? [current.id, candidate.id]
                : [candidate.id, current.id];
            const distance = current.phash64 && candidate.phash64
                ? hammingDistance(current.phash64, candidate.phash64)
                : 0;
            edges.push({
                leftId,
                rightId,
                distance,
                score: 1 - (distance / 64),
            });
        }
    }

    return edges;
}

export function buildVariantGroupingGraph(params: {
    db: DbHandle;
    changedAssetIds: string[];
    threshold: number;
}): {
    assets: GroupingSimilarityAsset[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
} {
    if (params.changedAssetIds.length === 0) {
        return { assets: [], edges: [], components: [] };
    }

    const duplicateMemberIds = loadDuplicateMemberIds(params.db);
    const eligibleAssets = loadVariantEligibleAssets(params.db)
        .filter((asset) => !duplicateMemberIds.has(asset.id));
    const reachableAssetIds = collectReachableVariantAssetIds(
        eligibleAssets,
        params.changedAssetIds,
        params.threshold,
    );
    const impactedAssets = eligibleAssets.filter((asset) => reachableAssetIds.has(asset.id));
    const edges = buildVariantEdges(impactedAssets, params.threshold);
    const components = buildConnectedComponents(
        impactedAssets.map((asset) => asset.id),
        edges,
    ).filter((component) => component.length > 1);

    return {
        assets: impactedAssets,
        edges,
        components,
    };
}

export function buildBurstGroupingGraph(params: {
    db: DbHandle;
    changedAssetIds: string[];
    maxSeconds: number;
    maxDistance: number;
}): {
    assets: BurstGroupingAsset[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
} {
    if (params.changedAssetIds.length === 0) {
        return { assets: [], edges: [], components: [] };
    }

    const eligibleAssets = loadBurstEligibleAssets(params.db);
    const reachableAssetIds = collectReachableBurstAssetIds(
        eligibleAssets,
        params.changedAssetIds,
        params.maxSeconds,
        params.maxDistance,
    );
    const impactedAssets = eligibleAssets.filter((asset) => reachableAssetIds.has(asset.id));
    const edges = buildBurstEdges(impactedAssets, params.maxSeconds, params.maxDistance);
    const components = buildConnectedComponents(
        impactedAssets.map((asset) => asset.id),
        edges,
    ).filter((component) => component.length > 1);

    return {
        assets: impactedAssets,
        edges,
        components,
    };
}
