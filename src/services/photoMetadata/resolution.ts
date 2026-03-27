import type {
    PhotoMetadataBundle,
    PhotoMetadataProjection,
} from '../../boundary/contracts/core';
import type {
    PhotoMetadataAssertionRow,
    PhotoMetadataBlockRow,
    PhotoMetadataFieldSource,
    PhotoMetadataProjectionInput,
} from './repository';
import {
    resolveAuthenticity,
    resolveEstimatedDate,
    resolveQuality,
    resolveRegionsOfInterest,
    resolveSubjects,
} from './groupResolution';

type MachineSourceKind = string;

interface ResolvedField<T> {
    value: T;
    source: PhotoMetadataFieldSource | undefined;
}

export interface ResolvedPhotoMetadata {
    bundle: PhotoMetadataBundle;
    projectionInput: PhotoMetadataProjectionInput;
}

const MACHINE_SOURCE_RANKS: Record<string, number> = {
    gemini_pro_refined: 2,
    gemini_flash_scout: 1,
};

function createSourceSummary(sourceKind: string, sourceId: string): PhotoMetadataFieldSource {
    return { sourceKind, sourceId };
}

function sourceRank(sourceKind: MachineSourceKind): number {
    return MACHINE_SOURCE_RANKS[sourceKind] ?? 0;
}

function compareMachineBlocks(left: PhotoMetadataBlockRow, right: PhotoMetadataBlockRow): number {
    const rankDiff = sourceRank(right.source_kind) - sourceRank(left.source_kind);
    if (rankDiff !== 0) {
        return rankDiff;
    }

    const leftCreated = Date.parse(left.created_at);
    const rightCreated = Date.parse(right.created_at);
    if (leftCreated !== rightCreated) {
        return rightCreated - leftCreated;
    }

    return right.id.localeCompare(left.id);
}

function pickMachineBlock(blocks: PhotoMetadataBlockRow[]): PhotoMetadataBlockRow | null {
    if (blocks.length === 0) {
        return null;
    }

    return [...blocks].sort(compareMachineBlocks)[0] ?? null;
}

function latestAssertion(assertions: PhotoMetadataAssertionRow[], predicate: (assertion: PhotoMetadataAssertionRow) => boolean): PhotoMetadataAssertionRow | null {
    let winner: PhotoMetadataAssertionRow | null = null;
    for (const assertion of assertions) {
        if (predicate(assertion)) {
            winner = assertion;
        }
    }
    return winner;
}

function toNullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function manualSource(assertion: PhotoMetadataAssertionRow | null): PhotoMetadataFieldSource | undefined {
    return assertion ? createSourceSummary('manual', assertion.id) : undefined;
}

function machineSource(block: PhotoMetadataBlockRow | null): PhotoMetadataFieldSource | undefined {
    return block ? createSourceSummary(block.source_kind, block.id) : undefined;
}

function resolveFieldFromManualAndMachine<T>(params: {
    manualAssertion: PhotoMetadataAssertionRow | null;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: T;
    manualValue: (assertion: PhotoMetadataAssertionRow) => T;
}): ResolvedField<T> {
    if (params.manualAssertion) {
        return {
            value: params.manualValue(params.manualAssertion),
            source: manualSource(params.manualAssertion),
        };
    }

    return {
        value: params.machineValue,
        source: machineSource(params.machineBlock),
    };
}

function resolveNullableStringField(params: {
    assertions: PhotoMetadataAssertionRow[];
    fieldPath: string;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: string | null;
}): ResolvedField<string | null> {
    return resolveFieldFromManualAndMachine({
        manualAssertion: latestAssertion(params.assertions, (assertion) => assertion.field_path === params.fieldPath),
        machineBlock: params.machineBlock,
        machineValue: params.machineValue,
        manualValue: (assertion) => toNullableString(assertion.value),
    });
}

function resolveType(blocks: PhotoMetadataBlockRow[]): ResolvedField<string | null> {
    const block = pickMachineBlock(blocks);
    return {
        value: block?.data.type ?? null,
        source: machineSource(block),
    };
}

function resolveCaption(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<string | null> {
    const machineBlock = pickMachineBlock(blocks);
    return resolveNullableStringField({
        assertions,
        fieldPath: 'caption',
        machineBlock,
        machineValue: machineBlock?.data.caption ?? null,
    });
}

function resolveDescription(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<string | null> {
    const machineBlock = pickMachineBlock(blocks);
    return resolveNullableStringField({
        assertions,
        fieldPath: 'description',
        machineBlock,
        machineValue: machineBlock?.data.description ?? null,
    });
}

function resolveLocation(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<string | null> {
    const machineBlock = pickMachineBlock(blocks);
    return resolveNullableStringField({
        assertions,
        fieldPath: 'location',
        machineBlock,
        machineValue: machineBlock?.data.location ?? null,
    });
}

function resolveKeywords(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<string[]> {
    const manualAssertion = latestAssertion(assertions, (assertion) => assertion.field_path === 'keywords');
    const machineBlock = pickMachineBlock(blocks);

    return manualAssertion
        ? {
            value: toStringArray(manualAssertion.value),
            source: manualSource(manualAssertion),
        }
        : {
            value: machineBlock?.data.keywords ?? [],
            source: machineSource(machineBlock),
        };
}

function resolveEmotionalImpact(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<string | null> {
    const machineBlock = pickMachineBlock(blocks);
    return resolveNullableStringField({
        assertions,
        fieldPath: 'emotional_impact',
        machineBlock,
        machineValue: machineBlock?.data.emotional_impact ?? null,
    });
}

function resolveRecommendedEnhancements(blocks: PhotoMetadataBlockRow[]): ResolvedField<string[]> {
    const machineBlock = pickMachineBlock(blocks);
    return {
        value: machineBlock?.data.recommended_enhancements ?? [],
        source: machineSource(machineBlock),
    };
}

function buildResolvedBundle(params: {
    assetId: string;
    blocks: PhotoMetadataBlockRow[];
    assertions: PhotoMetadataAssertionRow[];
}): ResolvedPhotoMetadata {
    const type = resolveType(params.blocks);
    const caption = resolveCaption(params.blocks, params.assertions);
    const description = resolveDescription(params.blocks, params.assertions);
    const location = resolveLocation(params.blocks, params.assertions);
    const estimatedDate = resolveEstimatedDate({ blocks: params.blocks, assertions: params.assertions });
    const keywords = resolveKeywords(params.blocks, params.assertions);
    const emotionalImpact = resolveEmotionalImpact(params.blocks, params.assertions);
    const quality = resolveQuality({ blocks: params.blocks, assertions: params.assertions });
    const recommendedEnhancements = resolveRecommendedEnhancements(params.blocks);
    const authenticity = resolveAuthenticity({ blocks: params.blocks, assertions: params.assertions });
    const subjects = resolveSubjects(params.blocks);
    const regionsOfInterest = resolveRegionsOfInterest(params.blocks);

    const projection: PhotoMetadataProjection = {
        assetId: params.assetId,
        type: type.value,
        caption: caption.value,
        description: description.value,
        location: location.value,
        estimatedDate: estimatedDate.value,
        keywords: [...keywords.value],
        emotionalImpact: emotionalImpact.value,
        quality: quality.value,
        recommendedEnhancements: [...recommendedEnhancements.value],
        authenticity: authenticity.value,
        subjects: [...subjects.value],
        regionsOfInterest: [...regionsOfInterest.value],
    };

    return {
        bundle: {
            projection,
            provenance: {
                type: type.source,
                caption: caption.source,
                description: description.source,
                location: location.source,
                estimatedDate: estimatedDate.provenance,
                keywords: keywords.source,
                emotionalImpact: emotionalImpact.source,
                quality: quality.provenance,
                recommendedEnhancements: recommendedEnhancements.source,
                authenticity: authenticity.provenance,
                subjects: subjects.source,
                regionsOfInterest: regionsOfInterest.source,
            },
            evidence: {
                machineBlocks: params.blocks,
                manualAssertions: params.assertions,
            },
        },
        projectionInput: {
            assetId: params.assetId,
            type: projection.type,
            caption: projection.caption,
            description: projection.description,
            location: projection.location,
            estimatedDate: projection.estimatedDate,
            keywords: projection.keywords,
            emotionalImpact: projection.emotionalImpact,
            quality: projection.quality,
            recommendedEnhancements: projection.recommendedEnhancements,
            authenticity: projection.authenticity,
            subjects: subjects.value,
            regionsOfInterest: regionsOfInterest.value,
            provenance: {
                type: type.source,
                caption: caption.source,
                description: description.source,
                location: location.source,
                estimatedDate: estimatedDate.source,
                keywords: keywords.source,
                emotionalImpact: emotionalImpact.source,
                quality: quality.source,
                recommendedEnhancements: recommendedEnhancements.source,
                authenticity: authenticity.source,
                subjects: subjects.source,
                regionsOfInterest: regionsOfInterest.source,
            },
        },
    };
}

export function resolvePhotoMetadataBundle(params: {
    assetId: string;
    blocks: PhotoMetadataBlockRow[];
    assertions: PhotoMetadataAssertionRow[];
}): ResolvedPhotoMetadata {
    return buildResolvedBundle(params);
}
