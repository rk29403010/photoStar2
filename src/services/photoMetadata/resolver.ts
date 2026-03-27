import type { DatabaseManager } from '../../data/db';
import type {
    PhotoMetadataBundle,
    PhotoMetadataProjection,
    PhotoMetadataProjectionAuthenticity,
    PhotoMetadataProjectionDate,
    PhotoMetadataProjectionQuality,
} from '../../boundary/contracts/core';
import type {
    PhotoMetadataAssertionRow,
    PhotoMetadataBlockRow,
    PhotoMetadataFieldSource,
    PhotoMetadataProjectionInput,
} from './repository';
import { createPhotoMetadataRepository } from './repository';

type MachineSourceKind = string;

type FieldSource = PhotoMetadataFieldSource;

interface ResolvedField<T> {
    value: T;
    source: FieldSource | undefined;
}

interface ResolvePhotoMetadataOptions {
    dbManager: DatabaseManager;
}

interface ResolvedPhotoMetadata {
    bundle: PhotoMetadataBundle;
    projectionInput: PhotoMetadataProjectionInput;
}

const MACHINE_SOURCE_RANKS: Record<string, number> = {
    gemini_pro_refined: 2,
    gemini_flash_scout: 1,
};

function createSourceSummary(sourceKind: string, sourceId: string): FieldSource {
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

    const orderedBlocks = [...blocks].sort(compareMachineBlocks);
    return orderedBlocks[0] ?? null;
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

function toNumberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toBooleanOrNull(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function manualSource(assertion: PhotoMetadataAssertionRow | null): FieldSource | undefined {
    return assertion ? createSourceSummary('manual', assertion.id) : undefined;
}

function machineSource(block: PhotoMetadataBlockRow | null): FieldSource | undefined {
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

function resolveNumericField(params: {
    assertions: PhotoMetadataAssertionRow[];
    fieldPath: string;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: number | null;
}): ResolvedField<number | null> {
    return resolveFieldFromManualAndMachine({
        manualAssertion: latestAssertion(params.assertions, (assertion) => assertion.field_path === params.fieldPath),
        machineBlock: params.machineBlock,
        machineValue: params.machineValue,
        manualValue: (assertion) => toNumberOrNull(assertion.value),
    });
}

function resolveBooleanField(params: {
    assertions: PhotoMetadataAssertionRow[];
    fieldPath: string;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: boolean | null;
}): ResolvedField<boolean | null> {
    return resolveFieldFromManualAndMachine({
        manualAssertion: latestAssertion(params.assertions, (assertion) => assertion.field_path === params.fieldPath),
        machineBlock: params.machineBlock,
        machineValue: params.machineValue,
        manualValue: (assertion) => toBooleanOrNull(assertion.value),
    });
}

function resolveStringValueField(params: {
    assertions: PhotoMetadataAssertionRow[];
    fieldPath: string;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: string | null;
}): string | null {
    return resolveNullableStringField(params).value;
}

function resolveNumberValueField(params: {
    assertions: PhotoMetadataAssertionRow[];
    fieldPath: string;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: number | null;
}): number | null {
    return resolveNumericField(params).value;
}

function resolveBooleanValueField(params: {
    assertions: PhotoMetadataAssertionRow[];
    fieldPath: string;
    machineBlock: PhotoMetadataBlockRow | null;
    machineValue: boolean | null;
}): boolean | null {
    return resolveBooleanField(params).value;
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

function resolveEstimatedDate(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<PhotoMetadataProjectionDate> {
    const machineBlock = pickMachineBlock(blocks);
    const dateAssertion = latestAssertion(assertions, (assertion) => assertion.field_path.startsWith('estimated_date.'));

    const machineDate = machineBlock?.data.estimated_date;
    const value: PhotoMetadataProjectionDate = {
        display_label: resolveStringValueField({
            assertions,
            fieldPath: 'estimated_date.display_label',
            machineBlock,
            machineValue: machineDate ? machineDate.display_label : '',
        }) ?? '',
        most_likely_date: resolveStringValueField({
            assertions,
            fieldPath: 'estimated_date.most_likely_date',
            machineBlock,
            machineValue: machineDate ? machineDate.most_likely_date : null,
        }),
        min_date: resolveStringValueField({
            assertions,
            fieldPath: 'estimated_date.min_date',
            machineBlock,
            machineValue: machineDate ? machineDate.min_date : null,
        }),
        max_date: resolveStringValueField({
            assertions,
            fieldPath: 'estimated_date.max_date',
            machineBlock,
            machineValue: machineDate ? machineDate.max_date : null,
        }),
        rationale: resolveStringValueField({
            assertions,
            fieldPath: 'estimated_date.rationale',
            machineBlock,
            machineValue: machineDate ? machineDate.rationale : null,
        }),
    };

    return {
        value,
        source: manualSource(dateAssertion) ?? machineSource(machineBlock),
    };
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

function resolveQuality(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<PhotoMetadataProjectionQuality> {
    const machineBlock = pickMachineBlock(blocks);
    const qualityAssertion = latestAssertion(assertions, (assertion) => assertion.field_path.startsWith('quality.'));

    const machineQuality = machineBlock?.data.quality;
    const value: PhotoMetadataProjectionQuality = {
        technical: resolveNumberValueField({
            assertions,
            fieldPath: 'quality.technical',
            machineBlock,
            machineValue: machineQuality ? machineQuality.technical : null,
        }),
        lighting: resolveNumberValueField({
            assertions,
            fieldPath: 'quality.lighting',
            machineBlock,
            machineValue: machineQuality ? machineQuality.lighting : null,
        }),
        composition: resolveNumberValueField({
            assertions,
            fieldPath: 'quality.composition',
            machineBlock,
            machineValue: machineQuality ? machineQuality.composition : null,
        }),
        emotional: resolveNumberValueField({
            assertions,
            fieldPath: 'quality.emotional',
            machineBlock,
            machineValue: machineQuality ? machineQuality.emotional : null,
        }),
        discard: resolveBooleanValueField({
            assertions,
            fieldPath: 'quality.discard',
            machineBlock,
            machineValue: machineQuality ? machineQuality.discard : null,
        }),
    };

    return {
        value,
        source: manualSource(qualityAssertion) ?? machineSource(machineBlock),
    };
}

function resolveRecommendedEnhancements(blocks: PhotoMetadataBlockRow[]): ResolvedField<string[]> {
    const machineBlock = pickMachineBlock(blocks);
    return {
        value: machineBlock?.data.recommended_enhancements ?? [],
        source: machineSource(machineBlock),
    };
}

function resolveAuthenticity(blocks: PhotoMetadataBlockRow[], assertions: PhotoMetadataAssertionRow[]): ResolvedField<PhotoMetadataProjectionAuthenticity> {
    const machineBlock = pickMachineBlock(blocks);
    const authenticityAssertion = latestAssertion(assertions, (assertion) => assertion.field_path.startsWith('authenticity.'));
    const scoreAssertion = latestAssertion(assertions, (assertion) => assertion.field_path === 'authenticity.score');
    const reasonsAssertion = latestAssertion(assertions, (assertion) => assertion.field_path === 'authenticity.reasons');

    const machineAuthenticity = machineBlock?.data.authenticity;
    const value: PhotoMetadataProjectionAuthenticity = {
        score: scoreAssertion ? toNumberOrNull(scoreAssertion.value) : machineAuthenticity?.score ?? null,
        reasons: reasonsAssertion ? toStringArray(reasonsAssertion.value) : machineAuthenticity?.reasons ?? [],
    };

    return {
        value,
        source: manualSource(authenticityAssertion) ?? machineSource(machineBlock),
    };
}

function resolveSubjects(blocks: PhotoMetadataBlockRow[]): ResolvedField<PhotoMetadataBlockRow['data']['subjects']> {
    const machineBlock = pickMachineBlock(blocks);
    return {
        value: machineBlock?.data.subjects ?? [],
        source: machineSource(machineBlock),
    };
}

function resolveRegionsOfInterest(blocks: PhotoMetadataBlockRow[]): ResolvedField<PhotoMetadataBlockRow['data']['regions_of_interest']> {
    const machineBlock = pickMachineBlock(blocks);
    return {
        value: machineBlock?.data.regions_of_interest ?? [],
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
    const estimatedDate = resolveEstimatedDate(params.blocks, params.assertions);
    const keywords = resolveKeywords(params.blocks, params.assertions);
    const emotionalImpact = resolveEmotionalImpact(params.blocks, params.assertions);
    const quality = resolveQuality(params.blocks, params.assertions);
    const recommendedEnhancements = resolveRecommendedEnhancements(params.blocks);
    const authenticity = resolveAuthenticity(params.blocks, params.assertions);
    const subjects = resolveSubjects(params.blocks);
    const regionsOfInterest = resolveRegionsOfInterest(params.blocks);

    const projection: PhotoMetadataProjection = {
        assetId: params.assetId,
        type: type.value,
        caption: caption.value,
        description: description.value,
        location: location.value,
        estimatedDate: { ...estimatedDate.value },
        keywords: [...keywords.value],
        emotionalImpact: emotionalImpact.value,
        quality: { ...quality.value },
        recommendedEnhancements: [...recommendedEnhancements.value],
        authenticity: { ...authenticity.value },
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
                estimatedDate: estimatedDate.source,
                keywords: keywords.source,
                emotionalImpact: emotionalImpact.source,
                quality: quality.source,
                recommendedEnhancements: recommendedEnhancements.source,
                authenticity: authenticity.source,
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

export class PhotoMetadataResolver {
    constructor(private readonly dbManager: DatabaseManager) {}

    resolvePhotoMetadata(assetId: string): PhotoMetadataBundle {
        const repository = createPhotoMetadataRepository({ dbManager: this.dbManager });
        const blocks = repository.listBlocksForAsset(assetId);
        const assertions = repository.listAssertionsForAsset(assetId);
        const resolved = buildResolvedBundle({ assetId, blocks, assertions });

        repository.saveResolvedProjection(resolved.projectionInput);
        return resolved.bundle;
    }
}

export function createPhotoMetadataResolver(options: ResolvePhotoMetadataOptions): PhotoMetadataResolver {
    return new PhotoMetadataResolver(options.dbManager);
}
