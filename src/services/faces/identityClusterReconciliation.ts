export type ReconcileableIdentityCluster = {
    id: string;
    faceIds: string[];
};

type OverlapScore = {
    sharedCount: number;
    jaccard: number;
};

function scoreOverlap(left: ReconcileableIdentityCluster, right: ReconcileableIdentityCluster): OverlapScore {
    const leftIds = new Set(left.faceIds);
    let sharedCount = 0;
    for (const faceId of right.faceIds) {
        if (leftIds.has(faceId)) {
            sharedCount += 1;
        }
    }
    const unionCount = leftIds.size + new Set(right.faceIds).size - sharedCount;
    return {
        sharedCount,
        jaccard: unionCount === 0 ? 0 : sharedCount / unionCount,
    };
}

function compareScores(left: OverlapScore, right: OverlapScore): number {
    if (left.sharedCount !== right.sharedCount) {
        return left.sharedCount - right.sharedCount;
    }
    return left.jaccard - right.jaccard;
}

function findUniqueBestIndex(
    target: ReconcileableIdentityCluster,
    candidates: ReconcileableIdentityCluster[],
): number | null {
    let bestIndex: number | null = null;
    let bestScore: OverlapScore = { sharedCount: 0, jaccard: 0 };
    let tied = false;

    for (let index = 0; index < candidates.length; index += 1) {
        const score = scoreOverlap(target, candidates[index]);
        if (score.sharedCount === 0) {
            continue;
        }
        const comparison = compareScores(score, bestScore);
        if (comparison > 0) {
            bestIndex = index;
            bestScore = score;
            tied = false;
        } else if (comparison === 0 && bestIndex !== null) {
            tied = true;
        }
    }
    return tied ? null : bestIndex;
}

/**
 * Reuses a prior rebuildable cluster ID only when old and new clusters are each
 * the other's unique best membership-overlap match. Splits, merges and ties can
 * therefore retain at most one clear continuation; ambiguous cases keep the
 * proposed fresh ID rather than manufacturing machine-history certainty.
 */
export function reconcileIdentityClusterIds(
    previous: ReconcileableIdentityCluster[],
    proposed: ReconcileableIdentityCluster[],
): ReconcileableIdentityCluster[] {
    const previousBestNew = previous.map((cluster) => findUniqueBestIndex(cluster, proposed));
    const proposedBestPrevious = proposed.map((cluster) => findUniqueBestIndex(cluster, previous));

    return proposed.map((cluster, newIndex) => {
        const previousIndex = proposedBestPrevious[newIndex];
        if (previousIndex === null || previousBestNew[previousIndex] !== newIndex) {
            return { ...cluster, faceIds: [...cluster.faceIds] };
        }
        return {
            ...cluster,
            id: previous[previousIndex].id,
            faceIds: [...cluster.faceIds],
        };
    });
}
