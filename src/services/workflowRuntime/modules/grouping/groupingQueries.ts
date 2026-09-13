import { hammingDistance } from '../../../math-utils';
import { buildConnectedComponents, type SimilarityEdgeRef } from './groupingGraph';
import type { SimilarityGroupingUnit } from './groupingUnits';

export type GroupingSimilarityAsset = {
    id: string;
    originalPath: string;
    fileHash: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
    phash64: string | null;
    dhash64: string | null;
}

export type GroupingSimilarityEdge = {
    score: number;
    distance: number;
} & SimilarityEdgeRef

export type GroupingGraph = {
    units: SimilarityGroupingUnit[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
};

export type BurstGroupingAsset = {
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

type VisualFingerprint = Pick<GroupingSimilarityAsset, 'phash64' | 'dhash64'>;
type BurstFingerprint = Pick<BurstGroupingAsset, 'exifDatetime' | 'phash64' | 'dhash64'>;

function isVisualMatch(
    left: VisualFingerprint,
    right: VisualFingerprint,
    threshold: number,
): { distance: number; matches: boolean } {
    if (!left.phash64 || !right.phash64 || !left.dhash64 || !right.dhash64) {
        return { distance: 64, matches: false };
    }

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
            if (!match.matches || visited.has(candidate.unitId)) {
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
    left: BurstFingerprint,
    right: BurstFingerprint,
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

function burstEvidenceForUnit(unit: SimilarityGroupingUnit): BurstFingerprint[] {
    const evidence = unit.memberEvidence?.length
        ? unit.memberEvidence
        : [{
            assetId: unit.representativeAssetId,
            exifDatetime: unit.exifDatetime,
            phash64: unit.phash64,
            dhash64: unit.dhash64,
        }];
    return evidence
        .filter((member): member is typeof member & { exifDatetime: string } => member.exifDatetime !== null)
        .map((member) => ({
            exifDatetime: member.exifDatetime,
            phash64: member.phash64,
            dhash64: member.dhash64,
        }));
}

function matchBurstUnits(
    left: SimilarityGroupingUnit,
    right: SimilarityGroupingUnit,
    maxSeconds: number,
    maxDistance: number,
): { matches: boolean; distance: number } {
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const leftEvidence of burstEvidenceForUnit(left)) {
        for (const rightEvidence of burstEvidenceForUnit(right)) {
            if (!isBurstMatch(leftEvidence, rightEvidence, maxSeconds, maxDistance)) {
                continue;
            }
            const distance = leftEvidence.phash64 && rightEvidence.phash64
                ? hammingDistance(leftEvidence.phash64, rightEvidence.phash64)
                : 0;
            bestDistance = Math.min(bestDistance, distance);
        }
    }
    if (!Number.isFinite(bestDistance)) {
        return { matches: false, distance: 64 };
    }
    return { matches: true, distance: bestDistance };
}

function collectReachableBurstUnitIds(
    units: SimilarityGroupingUnit[],
    changedUnitIds: string[],
    maxSeconds: number,
    maxDistance: number,
): Set<string> {
    const byId = new Map(units.map((unit) => [unit.unitId, unit]));
    const visited = new Set<string>();
    const frontier: string[] = [];

    for (const unitId of changedUnitIds) {
        if (!byId.has(unitId)) {
            continue;
        }
        visited.add(unitId);
        frontier.push(unitId);
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

        for (const candidate of units) {
            if (candidate.unitId === current.unitId || visited.has(candidate.unitId)) {
                continue;
            }
            if (!matchBurstUnits(current, candidate, maxSeconds, maxDistance).matches) {
                continue;
            }
            visited.add(candidate.unitId);
            frontier.push(candidate.unitId);
        }
    }

    return visited;
}

function buildBurstEdgesFromUnits(
    units: SimilarityGroupingUnit[],
    maxSeconds: number,
    maxDistance: number,
): GroupingSimilarityEdge[] {
    const edges: GroupingSimilarityEdge[] = [];

    for (let index = 0; index < units.length; index += 1) {
        const current = units[index];
        for (let candidateIndex = index + 1; candidateIndex < units.length; candidateIndex += 1) {
            const candidate = units[candidateIndex];
            const match = matchBurstUnits(current, candidate, maxSeconds, maxDistance);
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

export function buildVariantGroupingGraphFromUnits(params: {
    units: SimilarityGroupingUnit[];
    changedAssetIds: string[];
    threshold: number;
}): GroupingGraph {
    if (params.changedAssetIds.length === 0) {
        return { units: [], edges: [], components: [] };
    }
    const reachableUnitIds = collectReachableAssetIds(
        params.units,
        params.changedAssetIds,
        params.threshold,
    );
    const impactedUnits = params.units.filter((unit) => reachableUnitIds.has(unit.unitId));
    const { edges, components } = buildAnchoredVariantGraph(impactedUnits, params.threshold);
    return { units: impactedUnits, edges, components };
}

export function buildNearDuplicateGroupingGraphFromUnits(params: {
    units: SimilarityGroupingUnit[];
    changedAssetIds: string[];
    threshold: number;
}): GroupingGraph {
    if (params.changedAssetIds.length === 0) {
        return { units: [], edges: [], components: [] };
    }
    const reachableUnitIds = collectReachableAssetIds(
        params.units,
        params.changedAssetIds,
        params.threshold,
    );
    const impactedUnits = params.units.filter((unit) => reachableUnitIds.has(unit.unitId));
    const edges = buildPairwiseEdges(impactedUnits, params.threshold);
    const components = buildConnectedComponents(
        impactedUnits.map((unit) => unit.unitId),
        edges,
    ).filter((component) => component.length > 1);
    return { units: impactedUnits, edges, components };
}

export function buildBurstGroupingGraphFromUnits(params: {
    units: SimilarityGroupingUnit[];
    changedAssetIds: string[];
    maxSeconds: number;
    maxDistance: number;
}): GroupingGraph {
    if (params.changedAssetIds.length === 0) {
        return { units: [], edges: [], components: [] };
    }
    const unitsWithTime = params.units.filter((unit) => burstEvidenceForUnit(unit).length > 0);
    const changedUnitIds = unitsWithTime
        .filter((unit) => unit.memberAssetIds.some((assetId) => params.changedAssetIds.includes(assetId)))
        .map((unit) => unit.unitId);
    const reachableUnitIds = collectReachableBurstUnitIds(
        unitsWithTime,
        changedUnitIds,
        params.maxSeconds,
        params.maxDistance,
    );
    const impactedUnits = unitsWithTime.filter((unit) => reachableUnitIds.has(unit.unitId));
    const edges = buildBurstEdgesFromUnits(
        impactedUnits,
        params.maxSeconds,
        params.maxDistance,
    );
    const components = buildConnectedComponents(
        impactedUnits.map((unit) => unit.unitId),
        edges,
    ).filter((component) => component.length > 1);
    return { units: impactedUnits, edges, components };
}
