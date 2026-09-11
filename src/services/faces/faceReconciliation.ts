import type { NormalizedBox, NormalizedPoint } from '../../boundary/contracts/photoEditor';

export type FaceReconciliationSource = {
    provider: string;
    modelVersion: string;
};

export type FaceReconciliationPolicy = {
    id: string;
    version: string;
    compatiblePriorSources: readonly FaceReconciliationSource[];
    minimumIoU: number;
    landmarkWeight: number;
    ambiguityMargin: number;
};

export type PriorFaceRegion = FaceReconciliationSource & {
    visualRegionId: string;
    box: NormalizedBox;
    landmarks?: readonly NormalizedPoint[];
};

export type CurrentFaceDetection = {
    detectionId: string;
    box: NormalizedBox;
    landmarks?: readonly NormalizedPoint[];
};

export type FaceReconciliationMatch = {
    detectionId: string;
    visualRegionId: string;
    score: number;
    iou: number;
    landmarkSimilarity: number | null;
};

export type FaceReconciliationResult = {
    matches: FaceReconciliationMatch[];
    unmatchedDetectionIds: string[];
    unmatchedVisualRegionIds: string[];
    ambiguousDetectionIds: string[];
    ambiguousVisualRegionIds: string[];
};

type MatchCandidate = FaceReconciliationMatch & {
    geometryKey: string;
};

function assertUnitInterval(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${label} must be between 0 and 1.`);
    }
}

function validatePolicy(policy: FaceReconciliationPolicy): void {
    if (!policy.id.trim() || !policy.version.trim()) {
        throw new Error('Face reconciliation policy id and version are required.');
    }
    if (policy.compatiblePriorSources.length === 0) {
        throw new Error('Face reconciliation policy requires at least one compatible prior source.');
    }
    assertUnitInterval(policy.minimumIoU, 'Face reconciliation minimumIoU');
    assertUnitInterval(policy.landmarkWeight, 'Face reconciliation landmarkWeight');
    assertUnitInterval(policy.ambiguityMargin, 'Face reconciliation ambiguityMargin');
}

function intersectionArea(left: NormalizedBox, right: NormalizedBox): number {
    const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
    const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
    return width * height;
}

export function normalizedBoxIoU(left: NormalizedBox, right: NormalizedBox): number {
    const intersection = intersectionArea(left, right);
    if (intersection === 0) {
        return 0;
    }
    const union = left.width * left.height + right.width * right.height - intersection;
    return union > 0 ? intersection / union : 0;
}

function boxDiagonal(box: NormalizedBox): number {
    return Math.hypot(box.width, box.height);
}

function landmarkSimilarity(
    prior: PriorFaceRegion,
    current: CurrentFaceDetection,
): number | null {
    const priorLandmarks = prior.landmarks;
    const currentLandmarks = current.landmarks;
    if (!priorLandmarks?.length || priorLandmarks.length !== currentLandmarks?.length) {
        return null;
    }
    const scale = (boxDiagonal(prior.box) + boxDiagonal(current.box)) / 2;
    if (scale <= 0) {
        return null;
    }
    const averageDistance = priorLandmarks.reduce((sum, point, index) => {
        const currentPoint = currentLandmarks[index]!;
        return sum + Math.hypot(point.x - currentPoint.x, point.y - currentPoint.y);
    }, 0) / priorLandmarks.length;
    return Math.max(0, Math.min(1, 1 - averageDistance / scale));
}

function sourceIsCompatible(policy: FaceReconciliationPolicy, prior: PriorFaceRegion): boolean {
    return policy.compatiblePriorSources.some((source) => (
        source.provider === prior.provider && source.modelVersion === prior.modelVersion
    ));
}

function geometryKey(detection: CurrentFaceDetection): string {
    const box = detection.box;
    const landmarks = detection.landmarks?.map((point) => `${point.x},${point.y}`).join(';') ?? '';
    return `${box.x},${box.y},${box.width},${box.height}|${landmarks}`;
}

function buildCandidate(
    policy: FaceReconciliationPolicy,
    prior: PriorFaceRegion,
    current: CurrentFaceDetection,
): MatchCandidate | null {
    if (!sourceIsCompatible(policy, prior)) {
        return null;
    }
    const iou = normalizedBoxIoU(prior.box, current.box);
    if (iou < policy.minimumIoU) {
        return null;
    }
    const landmark = landmarkSimilarity(prior, current);
    const score = landmark === null
        ? iou
        : iou * (1 - policy.landmarkWeight) + landmark * policy.landmarkWeight;
    return {
        detectionId: current.detectionId,
        visualRegionId: prior.visualRegionId,
        score,
        iou,
        landmarkSimilarity: landmark,
        geometryKey: geometryKey(current),
    };
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
    if (left.score !== right.score) {
        return right.score - left.score;
    }
    if (left.iou !== right.iou) {
        return right.iou - left.iou;
    }
    const leftLandmark = left.landmarkSimilarity ?? -1;
    const rightLandmark = right.landmarkSimilarity ?? -1;
    if (leftLandmark !== rightLandmark) {
        return rightLandmark - leftLandmark;
    }
    const regionOrder = left.visualRegionId.localeCompare(right.visualRegionId);
    if (regionOrder !== 0) {
        return regionOrder;
    }
    const geometryOrder = left.geometryKey.localeCompare(right.geometryKey);
    return geometryOrder !== 0 ? geometryOrder : left.detectionId.localeCompare(right.detectionId);
}

function collectAmbiguousIds(
    candidates: readonly MatchCandidate[],
    key: 'detectionId' | 'visualRegionId',
    margin: number,
): Set<string> {
    const grouped = new Map<string, MatchCandidate[]>();
    for (const candidate of candidates) {
        const entries = grouped.get(candidate[key]) ?? [];
        entries.push(candidate);
        grouped.set(candidate[key], entries);
    }
    const ambiguous = new Set<string>();
    for (const [id, entries] of grouped) {
        const ranked = [...entries].sort(compareCandidates);
        if (ranked.length > 1 && ranked[0]!.score - ranked[1]!.score <= margin) {
            ambiguous.add(id);
        }
    }
    return ambiguous;
}

function buildCandidates(
    policy: FaceReconciliationPolicy,
    priorRegions: readonly PriorFaceRegion[],
    detections: readonly CurrentFaceDetection[],
): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];
    for (const prior of priorRegions) {
        for (const detection of detections) {
            const candidate = buildCandidate(policy, prior, detection);
            if (candidate) {
                candidates.push(candidate);
            }
        }
    }
    return candidates;
}

export function reconcileFaceDetections(
    policy: FaceReconciliationPolicy,
    priorRegions: readonly PriorFaceRegion[],
    detections: readonly CurrentFaceDetection[],
): FaceReconciliationResult {
    validatePolicy(policy);
    const candidates = buildCandidates(policy, priorRegions, detections);
    const ambiguousDetections = collectAmbiguousIds(candidates, 'detectionId', policy.ambiguityMargin);
    const ambiguousRegions = collectAmbiguousIds(candidates, 'visualRegionId', policy.ambiguityMargin);
    const usedDetections = new Set<string>();
    const usedRegions = new Set<string>();
    const matches: FaceReconciliationMatch[] = [];

    for (const candidate of [...candidates].sort(compareCandidates)) {
        if (ambiguousDetections.has(candidate.detectionId) || ambiguousRegions.has(candidate.visualRegionId)
            || usedDetections.has(candidate.detectionId) || usedRegions.has(candidate.visualRegionId)) {
            continue;
        }
        usedDetections.add(candidate.detectionId);
        usedRegions.add(candidate.visualRegionId);
        const { geometryKey: _geometryKey, ...match } = candidate;
        matches.push(match);
    }

    matches.sort((left, right) => left.detectionId.localeCompare(right.detectionId));
    return {
        matches,
        unmatchedDetectionIds: detections
            .map((detection) => detection.detectionId)
            .filter((id) => !usedDetections.has(id))
            .sort((left, right) => left.localeCompare(right)),
        unmatchedVisualRegionIds: priorRegions
            .map((region) => region.visualRegionId)
            .filter((id) => !usedRegions.has(id))
            .sort((left, right) => left.localeCompare(right)),
        ambiguousDetectionIds: [...ambiguousDetections].sort((left, right) => left.localeCompare(right)),
        ambiguousVisualRegionIds: [...ambiguousRegions].sort((left, right) => left.localeCompare(right)),
    };
}
