import type { DatabaseManager } from '../../../../data/db';
import { replaceVisualSimilarityObservations } from '../../../relationships/visualSimilarityObservationRepository';
import { hammingDistance } from '../../../math-utils';
import type { GroupingSimilarityEdge } from './groupingQueries';
import type { SimilarityGroupingUnit } from './groupingUnits';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type VisualRoute = {
    policy: 'near_duplicate' | 'variant';
    threshold: number;
    leftUnitId: string;
    rightUnitId: string;
};

type ObservationDraft = {
    assetIdA: string;
    assetIdB: string;
    phashDistance: number;
    dhashDistance: number;
    score: number;
    routes: VisualRoute[];
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

function addGraphObservations(
    drafts: Map<string, ObservationDraft>,
    graph: VisualGraphInput,
    policy: VisualRoute['policy'],
): void {
    const unitById = new Map(graph.units.map((unit) => [unit.unitId, unit]));
    for (const edge of graph.edges) {
        const left = unitById.get(edge.leftId);
        const right = unitById.get(edge.rightId);
        if (!left || !right || left.representativeAssetId === right.representativeAssetId) {
            continue;
        }

        const key = pairKey(left.representativeAssetId, right.representativeAssetId);
        const phashDistance = hammingDistance(left.phash64, right.phash64);
        const dhashDistance = hammingDistance(left.dhash64, right.dhash64);
        const existing = drafts.get(key);
        const route: VisualRoute = {
            policy,
            threshold: graph.threshold,
            leftUnitId: edge.leftId,
            rightUnitId: edge.rightId,
        };
        if (existing) {
            existing.routes.push(route);
            continue;
        }

        drafts.set(key, {
            assetIdA: left.representativeAssetId,
            assetIdB: right.representativeAssetId,
            phashDistance,
            dhashDistance,
            score: 1 - (Math.max(phashDistance, dhashDistance) / 64),
            routes: [route],
        });
    }
}

export function syncVisualSimilarityObservations(params: {
    db: DbHandle;
    changedAssetIds: string[];
    nearDuplicateGraph: VisualGraphInput;
    variantGraph: VisualGraphInput;
}): void {
    const drafts = new Map<string, ObservationDraft>();
    addGraphObservations(drafts, params.nearDuplicateGraph, 'near_duplicate');
    addGraphObservations(drafts, params.variantGraph, 'variant');

    replaceVisualSimilarityObservations(params.db, {
        impactedAssetIds: params.changedAssetIds,
        sourceIdentity: 'runtime.group_similar_photos:visual_hash',
        sourceRef: 'runtime.group_similar_photos@1',
        algorithmVersion: '1.0',
        observations: [...drafts.values()].map((draft) => ({
            assetIdA: draft.assetIdA,
            assetIdB: draft.assetIdB,
            phashDistance: draft.phashDistance,
            dhashDistance: draft.dhashDistance,
            score: draft.score,
            evidence: {
                measurement: 'phash64+dhash64',
                routes: draft.routes,
            },
        })),
    });
}
