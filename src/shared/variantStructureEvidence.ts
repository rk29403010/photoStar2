/** Supplemental evidence for tonal edits; never a near-duplicate policy. */
export type VariantStructureEvidence = {
    measurement: 'spatial-gradient-v1';
    gradientCosine: number;
    dhashDistance: number;
    aspectRatioDelta: number;
};

export const VARIANT_STRUCTURE_MAX_DHASH = 12;
const MIN_GRADIENT_COSINE = 0.8;
const MAX_ASPECT_RATIO_DELTA = 0.1;

function isInRange(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isAcceptedVariantStructureEvidence(value: unknown): value is VariantStructureEvidence {
    if (!isRecord(value)) {return false;}
    const evidence = value;
    return evidence.measurement === 'spatial-gradient-v1'
        && isInRange(evidence.gradientCosine, MIN_GRADIENT_COSINE, 1)
        && isInRange(evidence.dhashDistance, 0, VARIANT_STRUCTURE_MAX_DHASH)
        && Number.isInteger(evidence.dhashDistance)
        && isInRange(evidence.aspectRatioDelta, 0, MAX_ASPECT_RATIO_DELTA);
}

export function variantPairKey(leftAssetId: string, rightAssetId: string): string {
    return [leftAssetId, rightAssetId].sort().join('\n');
}
