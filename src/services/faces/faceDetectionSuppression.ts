export interface SuppressibleFaceCandidate {
    score: number;
    box: [number, number, number, number];
    landmarks?: Array<{ x: number; y: number }>;
}

function intersectionArea(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
    const x1 = Math.max(boxA[0], boxB[0]);
    const y1 = Math.max(boxA[1], boxB[1]);
    const x2 = Math.min(boxA[2], boxB[2]);
    const y2 = Math.min(boxA[3], boxB[3]);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function boxArea(box: [number, number, number, number]): number {
    return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

function computeIoU(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
    const intersection = intersectionArea(boxA, boxB);
    if (intersection <= 0) {
        return 0;
    }

    const areaA = boxArea(boxA);
    const areaB = boxArea(boxB);
    return intersection / (areaA + areaB - intersection);
}

function computeIntersectionOverMinArea(
    boxA: [number, number, number, number],
    boxB: [number, number, number, number],
): number {
    const intersection = intersectionArea(boxA, boxB);
    if (intersection <= 0) {
        return 0;
    }

    const minArea = Math.min(boxArea(boxA), boxArea(boxB));
    return minArea > 0 ? intersection / minArea : 0;
}

function computeCenterDistanceRatio(
    boxA: [number, number, number, number],
    boxB: [number, number, number, number],
): number {
    const centerAX = (boxA[0] + boxA[2]) / 2;
    const centerAY = (boxA[1] + boxA[3]) / 2;
    const centerBX = (boxB[0] + boxB[2]) / 2;
    const centerBY = (boxB[1] + boxB[3]) / 2;
    const distance = Math.hypot(centerAX - centerBX, centerAY - centerBY);
    const averageSize = (
        (boxA[2] - boxA[0])
        + (boxA[3] - boxA[1])
        + (boxB[2] - boxB[0])
        + (boxB[3] - boxB[1])
    ) / 4;

    return averageSize > 0 ? distance / averageSize : Number.POSITIVE_INFINITY;
}

function shouldSuppressCandidate(
    kept: SuppressibleFaceCandidate,
    candidate: SuppressibleFaceCandidate,
): boolean {
    const iou = computeIoU(kept.box, candidate.box);
    if (iou > 0.4) {
        return true;
    }

    const overlapOverMinArea = computeIntersectionOverMinArea(kept.box, candidate.box);
    const centerDistanceRatio = computeCenterDistanceRatio(kept.box, candidate.box);
    return overlapOverMinArea >= 0.68 && centerDistanceRatio <= 0.35;
}

export function suppressDuplicateFaceCandidates<T extends SuppressibleFaceCandidate>(candidates: T[]): T[] {
    const pending = [...candidates].sort((left, right) => right.score - left.score);
    const kept: T[] = [];

    while (pending.length > 0) {
        const best = pending.shift();
        if (!best) {
            continue;
        }

        kept.push(best);
        for (let index = pending.length - 1; index >= 0; index -= 1) {
            if (shouldSuppressCandidate(best, pending[index])) {
                pending.splice(index, 1);
            }
        }
    }

    return kept;
}
