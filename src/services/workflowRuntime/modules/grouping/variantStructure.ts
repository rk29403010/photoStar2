import sharp from 'sharp';
import type { DatabaseManager } from '../../../../data/db';
import {
    isAcceptedVariantStructureEvidence,
    VARIANT_STRUCTURE_MAX_DHASH,
    variantPairKey,
    type VariantStructureEvidence,
} from '../../../../shared/variantStructureEvidence';
import { getOrientedDimensions } from '../../../faces/faceImageGeometry';
import { cosineSimilarity, hammingDistance } from '../../../math-utils';
import { buildRawSimilarityUnits, type SimilarityGroupingUnit } from './groupingUnits';

const SAMPLE_SIZE = 32;
type DbHandle = ReturnType<DatabaseManager['getDb']>;
type CandidatePair = { left: SimilarityGroupingUnit; right: SimilarityGroupingUnit; dhashDistance: number };
export type VariantStructureSample = { gradients: number[]; aspectRatio: number };

function candidateDistance(left: SimilarityGroupingUnit, right: SimilarityGroupingUnit): number {
    if (!left.dhash64 || !right.dhash64) {return 64;}
    return hammingDistance(left.dhash64, right.dhash64);
}

/** Traverse a cheap candidate neighbourhood; acceptance still requires direct anchor evidence. */
function collectCandidatePairs(units: SimilarityGroupingUnit[], changedAssetIds: string[]): CandidatePair[] {
    const changed = new Set(changedAssetIds);
    const frontier = units.filter(unit => changed.has(unit.representativeAssetId));
    const visited = new Set(frontier.map(unit => unit.unitId));
    const pairs = new Map<string, CandidatePair>();
    for (let index = 0; index < frontier.length; index += 1) {
        const left = frontier[index];
        for (const right of units) {
            if (left.unitId === right.unitId) {continue;}
            const dhashDistance = candidateDistance(left, right);
            if (dhashDistance > VARIANT_STRUCTURE_MAX_DHASH) {continue;}
            pairs.set(variantPairKey(left.representativeAssetId, right.representativeAssetId), { left, right, dhashDistance });
            if (!visited.has(right.unitId)) {
                visited.add(right.unitId);
                frontier.push(right);
            }
        }
    }
    return [...pairs.values()];
}

function sampleGradients(data: Buffer): number[] {
    const gradients: number[] = [];
    for (let y = 1; y < SAMPLE_SIZE - 1; y += 1) {
        for (let x = 1; x < SAMPLE_SIZE - 1; x += 1) {
            gradients.push(
                data[y * SAMPLE_SIZE + x + 1] - data[y * SAMPLE_SIZE + x - 1],
                data[(y + 1) * SAMPLE_SIZE + x] - data[(y - 1) * SAMPLE_SIZE + x],
            );
        }
    }
    return gradients;
}

export async function readVariantStructureSample(filePath: string): Promise<VariantStructureSample | null> {
    try {
        const image = sharp(filePath);
        const dimensions = getOrientedDimensions(await image.metadata());
        if (!dimensions) {return null;}
        const data = await image.rotate().resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
            .greyscale().removeAlpha().raw().toBuffer();
        return { gradients: sampleGradients(data), aspectRatio: dimensions.width / dimensions.height };
    } catch (error) {
        // Missing/unreadable originals cannot supply supplemental evidence; stored hashes remain usable.
        console.warn('[Grouping] Unable to measure variant structure:', filePath, error);
        return null;
    }
}

export function measureVariantStructure(
    left: VariantStructureSample,
    right: VariantStructureSample,
    dhashDistance: number,
): VariantStructureEvidence | null {
    const evidence: VariantStructureEvidence = {
        measurement: 'spatial-gradient-v1',
        gradientCosine: cosineSimilarity(left.gradients, right.gradients),
        dhashDistance,
        aspectRatioDelta: Math.abs(Math.log(left.aspectRatio / right.aspectRatio)),
    };
    return isAcceptedVariantStructureEvidence(evidence) ? evidence : null;
}

function alreadyMatchesStrictHashes(pair: CandidatePair): boolean {
    return pair.dhashDistance <= 6 && Boolean(pair.left.phash64 && pair.right.phash64
        && hammingDistance(pair.left.phash64, pair.right.phash64) <= 6);
}

export async function prepareVariantStructureMatches(
    db: DbHandle,
    changedAssetIds: string[],
): Promise<Map<string, VariantStructureEvidence>> {
    const pairs = collectCandidatePairs(buildRawSimilarityUnits(db), changedAssetIds);
    const samples = new Map<string, Promise<VariantStructureSample | null>>();
    const readSample = (unit: SimilarityGroupingUnit) => {
        let sample = samples.get(unit.representativeAssetId);
        if (!sample) {
            sample = readVariantStructureSample(unit.originalPath);
            samples.set(unit.representativeAssetId, sample);
        }
        return sample;
    };
    const matches = new Map<string, VariantStructureEvidence>();
    for (const pair of pairs) {
        if (alreadyMatchesStrictHashes(pair)) {continue;}
        const [left, right] = await Promise.all([readSample(pair.left), readSample(pair.right)]);
        if (!left || !right) {continue;}
        const evidence = measureVariantStructure(left, right, pair.dhashDistance);
        if (evidence) {matches.set(variantPairKey(pair.left.representativeAssetId, pair.right.representativeAssetId), evidence);}
    }
    return matches;
}
