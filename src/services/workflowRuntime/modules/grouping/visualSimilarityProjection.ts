import type { DatabaseManager } from '../../../../data/db';
import {
    replaceVisualSimilarityPolicyObservations,
    type VisualSimilarityPolicy,
} from '../../../relationships/visualSimilarityObservationRepository';
import { hammingDistance } from '../../../math-utils';
import type { GroupingSimilarityEdge } from './groupingQueries';
import type { SimilarityGroupingUnit } from './groupingUnits';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type ObservationDraft = {
    assetIdA: string;
    assetIdB: string;
    phashDistance: number;
    dhashDistance: number;
    score: number;
    evidence: Record<string, unknown>;
};

type VisualGraphInput = {
    units: SimilarityGroupingUnit[];
    edges: GroupingSimilarityEdge[];
    threshold: number;
};

function pairKey(leftAssetId: string, rightAssetId: string): string {
    return leftAssetId < rightAssetId
        ? `${leftAssetId}\n${rightAssetId}`
        : `${rightAssetId}\n${leftAssetId}`;
}

function buildGraphObservations(
    graph: VisualGraphInput,
    policy: VisualSimilarityPolicy,
): ObservationDraft[] {
    const unitById = new Map(graph.units.map((unit) => [unit.unitId, unit]));
    const drafts = new Map<string, ObservationDraft>();
    for (const edge of graph.edges) {
        const left = unitById.get(edge.leftId);
        const right = unitById.get(edge.rightId);
        if (!left || !right || left.representativeAssetId === right.representativeAssetId) {
            continue;
        }
        const phashDistance = hammingDistance(left.phash64, right.phash64);
        const dhashDistance = hammingDistance(left.dhash64, right.dhash64);
        drafts.set(pairKey(left.representativeAssetId, right.representativeAssetId), {
            assetIdA: left.representativeAssetId,
            assetIdB: right.representativeAssetId,
            phashDistance,
            dhashDistance,
            score: 1 - (Math.max(phashDistance, dhashDistance) / 64),
            evidence: {
                measurement: 'phash64+dhash64',
                routes: [{
                    policy,
                    threshold: graph.threshold,
                    leftUnitId: edge.leftId,
                    rightUnitId: edge.rightId,
                }],
            },
        });
    }
    return [...drafts.values()];
}

function syncPolicy(params: {
    db: DbHandle;
    changedAssetIds: string[];
    policy: VisualSimilarityPolicy;
    graph: VisualGraphInput;
}): void {
    replaceVisualSimilarityPolicyObservations(params.db, {
        impactedAssetIds: params.changedAssetIds,
        policy: params.policy,
        sourceIdentity: 'runtime.group_similar_photos:visual_hash',
        sourceRef: 'runtime.group_similar_photos@1',
        algorithmVersion: '1.0',
        observations: buildGraphObservations(params.graph, params.policy),
    });
}

export function syncVisualSimilarityObservations(params: {
    db: DbHandle;
    changedAssetIds: string[];
    nearDuplicateGraph: VisualGraphInput;
    variantGraph: VisualGraphInput;
}): void {
    syncPolicy({
        db: params.db,
        changedAssetIds: params.changedAssetIds,
        policy: 'near_duplicate',
        graph: params.nearDuplicateGraph,
    });
    syncPolicy({
        db: params.db,
        changedAssetIds: params.changedAssetIds,
        policy: 'variant',
        graph: params.variantGraph,
    });
}
