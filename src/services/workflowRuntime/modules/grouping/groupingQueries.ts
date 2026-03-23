import type { DatabaseManager } from '../../../../data/db';
import { hammingDistance } from '../../../math-utils';
import { buildConnectedComponents, type SimilarityEdgeRef } from './groupingGraph';
import { buildSimilarityUnits, type SimilarityGroupingUnit } from './groupingUnits';

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

function isVisualMatch(
    left: Pick<GroupingSimilarityAsset, 'phash64' | 'dhash64'>,
    right: Pick<GroupingSimilarityAsset, 'phash64' | 'dhash64'>,
    threshold: number,
): { distance: number; matches: boolean } {
    const perceptualDistance = hammingDistance(left.phash64, right.phash64);
    if (perceptualDistance > threshold) {
        return { distance: perceptualDistance, matches: false };
    }

    const differenceDistance = hammingDistance(left.dhash64, right.dhash64);
    if (differenceDistance > threshold) {
        return { distance: perceptualDistance, matches: false };
    }

    return { distance: perceptualDistance, matches: true };
}

function collectReachableAssetIds(
    assets: Array<Pick<SimilarityGroupingUnit, 'unitId' | 'memberAssetIds' | 'phash64' | 'dhash64'>>,
    changedAssetIds: string[],
    threshold: number,
): Set<string> {
    const byId = new Map(assets.map((asset) => [asset.unitId, asset]));
    const visited = new Set<string>();
    const frontier: string[] = [];

    for (const asset of assets) {
        if (!asset.memberAssetIds.some((assetId) => changedAssetIds.includes(assetId))) {
            continue;
        }
        visited.add(asset.unitId);
        frontier.push(asset.unitId);
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
            if (candidate.unitId === current.unitId) {
                continue;
            }
            const match = isVisualMatch(current, candidate, threshold);
            if (!match.matches) {
                continue;
            }
            if (visited.has(candidate.unitId)) {
                continue;
            }
            visited.add(candidate.unitId);
            frontier.push(candidate.unitId);
        }
    }

    return visited;
}

function buildPairwiseEdges<T extends Pick<SimilarityGroupingUnit, 'unitId' | 'phash64' | 'dhash64'>>(
    assets: T[],
    threshold: number,
): GroupingSimilarityEdge[] {
    const edges: GroupingSimilarityEdge[] = [];

    for (let index = 0; index < assets.length; index += 1) {
        const current = assets[index];
        for (let candidateIndex = index + 1; candidateIndex < assets.length; candidateIndex += 1) {
            const candidate = assets[candidateIndex];
            const match = isVisualMatch(current, candidate, threshold);
            if (!match.matches) {
                continue;
            }
            const [leftId, rightId] = current.unitId.localeCompare(candidate.unitId) <= 0
                ? [current.unitId, candidate.unitId]
                : [candidate.unitId, current.unitId];
            edges.push({
                leftId,
                rightId,
                distance: match.distance,
                score: 1 - (match.distance / 64),
            });
        }
    }

    return edges;
}

function sortAssetsForAnchoredClustering<T extends Pick<SimilarityGroupingUnit, 'unitId' | 'exifDatetime'>>(assets: T[]): T[] {
    return [...assets].sort((left, right) => {
        const leftTimestamp = left.exifDatetime ? Date.parse(left.exifDatetime) : Number.NEGATIVE_INFINITY;
        const rightTimestamp = right.exifDatetime ? Date.parse(right.exifDatetime) : Number.NEGATIVE_INFINITY;
        if (leftTimestamp !== rightTimestamp) {
            return leftTimestamp - rightTimestamp;
        }
        return left.unitId.localeCompare(right.unitId);
    });
}

function buildAnchoredVariantGraph(assets: SimilarityGroupingUnit[], threshold: number): {
    edges: GroupingSimilarityEdge[];
    components: string[][];
} {
    const orderedAssets = sortAssetsForAnchoredClustering(assets);
    const clusters: Array<{
        anchor: SimilarityGroupingUnit;
        memberIds: string[];
    }> = [];
    const edges: GroupingSimilarityEdge[] = [];

    for (const asset of orderedAssets) {
        let matchingCluster:
            | {
                anchor: SimilarityGroupingUnit;
                memberIds: string[];
            }
            | undefined;

        for (const cluster of clusters) {
            const match = isVisualMatch(cluster.anchor, asset, threshold);
            if (!match.matches) {
                continue;
            }
            matchingCluster = cluster;
            edges.push({
                leftId: cluster.anchor.unitId,
                rightId: asset.unitId,
                distance: match.distance,
                score: 1 - (match.distance / 64),
            });
            break;
        }

        if (matchingCluster) {
            matchingCluster.memberIds.push(asset.unitId);
            continue;
        }

        clusters.push({
            anchor: asset,
            memberIds: [asset.unitId],
        });
    }

    return {
        edges,
        components: clusters
            .map((cluster) => cluster.memberIds)
            .filter((component) => component.length > 1),
    };
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

    const perceptualDistance = hammingDistance(left.phash64, right.phash64);
    if (perceptualDistance > maxDistance) {
        return false;
    }

    if (!left.dhash64 || !right.dhash64) {
        return true;
    }

    return hammingDistance(left.dhash64, right.dhash64) <= maxDistance;
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
    units: SimilarityGroupingUnit[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
} {
    if (params.changedAssetIds.length === 0) {
        return { units: [], edges: [], components: [] };
    }

    const units = buildSimilarityUnits(params.db, ['near_duplicate', 'duplicate']);
    const reachableAssetIds = collectReachableAssetIds(
        units,
        params.changedAssetIds,
        params.threshold,
    );
    const impactedUnits = units.filter((unit) => reachableAssetIds.has(unit.unitId));
    const { edges, components } = buildAnchoredVariantGraph(impactedUnits, params.threshold);

    return {
        units: impactedUnits,
        edges,
        components,
    };
}

export function buildNearDuplicateGroupingGraph(params: {
    db: DbHandle;
    changedAssetIds: string[];
    threshold: number;
}): {
    units: SimilarityGroupingUnit[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
} {
    if (params.changedAssetIds.length === 0) {
        return { units: [], edges: [], components: [] };
    }

    const units = buildSimilarityUnits(params.db, ['duplicate']);
    const reachableAssetIds = collectReachableAssetIds(
        units,
        params.changedAssetIds,
        params.threshold,
    );
    const impactedUnits = units.filter((unit) => reachableAssetIds.has(unit.unitId));
    const edges = buildPairwiseEdges(impactedUnits, params.threshold);
    const components = buildConnectedComponents(
        impactedUnits.map((unit) => unit.unitId),
        edges,
    ).filter((component) => component.length > 1);

    return {
        units: impactedUnits,
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
    units: SimilarityGroupingUnit[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
} {
    if (params.changedAssetIds.length === 0) {
        return { units: [], edges: [], components: [] };
    }

    const units = buildSimilarityUnits(params.db, ['variant_set', 'near_duplicate', 'duplicate'])
        .filter((unit) => unit.exifDatetime !== null);
    const reachableAssetIds = collectReachableBurstAssetIds(
        units.map((unit) => ({
            id: unit.unitId,
            originalPath: unit.originalPath,
            fileHash: unit.fileHash,
            fileSize: unit.fileSize,
            width: unit.width,
            height: unit.height,
            exifDatetime: unit.exifDatetime!,
            phash64: unit.phash64,
            dhash64: unit.dhash64,
        })),
        units.filter((unit) => unit.memberAssetIds.some((assetId) => params.changedAssetIds.includes(assetId))).map((unit) => unit.unitId),
        params.maxSeconds,
        params.maxDistance,
    );
    const impactedUnits = units.filter((unit) => reachableAssetIds.has(unit.unitId));
    const edges = buildBurstEdges(
        impactedUnits.map((unit) => ({
            id: unit.unitId,
            originalPath: unit.originalPath,
            fileHash: unit.fileHash,
            fileSize: unit.fileSize,
            width: unit.width,
            height: unit.height,
            exifDatetime: unit.exifDatetime!,
            phash64: unit.phash64,
            dhash64: unit.dhash64,
        })),
        params.maxSeconds,
        params.maxDistance,
    );
    const components = buildConnectedComponents(
        impactedUnits.map((unit) => unit.unitId),
        edges,
    ).filter((component) => component.length > 1);

    return {
        units: impactedUnits,
        edges,
        components,
    };
}
