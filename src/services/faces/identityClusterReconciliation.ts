export type ReconcileableIdentityCluster = {
    id: string;
    faceIds: string[];
};

type OverlapScore = {
    sharedCount: number;
    jaccard: number;
};

type ClusterMembershipIndex = {
    candidateIndicesByFaceId: Map<string, number[]>;
    uniqueFaceCounts: number[];
};

function buildMembershipIndex(clusters: ReconcileableIdentityCluster[]): ClusterMembershipIndex {
    const candidateIndicesByFaceId = new Map<string, number[]>();
    const uniqueFaceCounts = clusters.map((cluster, candidateIndex) => {
        for (const faceId of cluster.faceIds) {
            const candidateIndices = candidateIndicesByFaceId.get(faceId) ?? [];
            candidateIndices.push(candidateIndex);
            candidateIndicesByFaceId.set(faceId, candidateIndices);
        }
        return new Set(cluster.faceIds).size;
    });
    return { candidateIndicesByFaceId, uniqueFaceCounts };
}

function compareScores(left: OverlapScore, right: OverlapScore): number {
    if (left.sharedCount !== right.sharedCount) {
        return left.sharedCount - right.sharedCount;
    }
    return left.jaccard - right.jaccard;
}

function countCandidateOverlaps(
    targetFaceIds: Set<string>,
    membershipIndex: ClusterMembershipIndex,
): Map<number, number> {
    const sharedCounts = new Map<number, number>();
    for (const faceId of targetFaceIds) {
        for (const candidateIndex of membershipIndex.candidateIndicesByFaceId.get(faceId) ?? []) {
            sharedCounts.set(candidateIndex, (sharedCounts.get(candidateIndex) ?? 0) + 1);
        }
    }
    return sharedCounts;
}

function makeOverlapScore(
    targetFaceCount: number,
    candidateFaceCount: number,
    sharedCount: number,
): OverlapScore {
    const unionCount = targetFaceCount + candidateFaceCount - sharedCount;
    return { sharedCount, jaccard: unionCount === 0 ? 0 : sharedCount / unionCount };
}

function findUniqueBestIndex(
    target: ReconcileableIdentityCluster,
    membershipIndex: ClusterMembershipIndex,
): number | null {
    let bestIndex: number | null = null;
    let bestScore: OverlapScore = { sharedCount: 0, jaccard: 0 };
    let tied = false;
    const targetFaceIds = new Set(target.faceIds);
    const sharedCounts = countCandidateOverlaps(targetFaceIds, membershipIndex);
    for (const [index, sharedCount] of sharedCounts) {
        const score = makeOverlapScore(targetFaceIds.size, membershipIndex.uniqueFaceCounts[index], sharedCount);
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
    const proposedMembership = buildMembershipIndex(proposed);
    const previousMembership = buildMembershipIndex(previous);
    const previousBestNew = previous.map((cluster) => findUniqueBestIndex(cluster, proposedMembership));
    const proposedBestPrevious = proposed.map((cluster) => findUniqueBestIndex(cluster, previousMembership));

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
