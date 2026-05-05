import type {
    PhotoMetadataAuthenticityProvenance,
    PhotoMetadataEstimatedDateProvenance,
    PhotoMetadataProjectionAuthenticity,
    PhotoMetadataProjectionDate,
    PhotoMetadataProjectionQuality,
    PhotoMetadataQualityProvenance,
} from '../../boundary/contracts/core';
import type {
    PhotoMetadataAssertionRow,
    PhotoMetadataBlockRow,
    PhotoMetadataFieldSource,
} from './repository';
import type {
    PhotoMetadataRegionOfInterest,
    PhotoMetadataSubject,
} from './types';

type ResolvedField<T> = {
    value: T;
    source: PhotoMetadataFieldSource | undefined;
}

type MachineSourceKind = string;

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

function toNumberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toBooleanOrNull(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
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

function allManualSources(fields: Array<ResolvedField<unknown>>): boolean {
    return fields.length > 0 && fields.every((field) => field.source?.sourceKind === 'manual');
}

function topLevelGroupSource(
    machineBlock: PhotoMetadataBlockRow | null,
    groupAssertion: PhotoMetadataAssertionRow | null,
    fields: Array<ResolvedField<unknown>>,
): PhotoMetadataFieldSource | undefined {
    if (allManualSources(fields)) {
        return manualSource(groupAssertion);
    }

    return machineSource(machineBlock);
}

function resolveEstimatedDateDisplayLabel(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineDate: PhotoMetadataBlockRow['data']['estimated_date'] | undefined;
}) {
    const machineValue = params.machineDate ? params.machineDate.display_label : '';
    return resolveNullableStringField({
        assertions: params.assertions,
        fieldPath: 'estimated_date.display_label',
        machineBlock: params.machineBlock,
        machineValue,
    });
}

function resolveEstimatedDateMostLikelyDate(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineDate: PhotoMetadataBlockRow['data']['estimated_date'] | undefined;
}) {
    const machineValue = params.machineDate ? params.machineDate.most_likely_date : null;
    return resolveNullableStringField({
        assertions: params.assertions,
        fieldPath: 'estimated_date.most_likely_date',
        machineBlock: params.machineBlock,
        machineValue,
    });
}

function resolveEstimatedDateMinDate(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineDate: PhotoMetadataBlockRow['data']['estimated_date'] | undefined;
}) {
    const machineValue = params.machineDate ? params.machineDate.min_date : null;
    return resolveNullableStringField({
        assertions: params.assertions,
        fieldPath: 'estimated_date.min_date',
        machineBlock: params.machineBlock,
        machineValue,
    });
}

function resolveEstimatedDateMaxDate(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineDate: PhotoMetadataBlockRow['data']['estimated_date'] | undefined;
}) {
    const machineValue = params.machineDate ? params.machineDate.max_date : null;
    return resolveNullableStringField({
        assertions: params.assertions,
        fieldPath: 'estimated_date.max_date',
        machineBlock: params.machineBlock,
        machineValue,
    });
}

function resolveEstimatedDateRationale(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineDate: PhotoMetadataBlockRow['data']['estimated_date'] | undefined;
}) {
    const machineValue = params.machineDate ? params.machineDate.rationale : null;
    return resolveNullableStringField({
        assertions: params.assertions,
        fieldPath: 'estimated_date.rationale',
        machineBlock: params.machineBlock,
        machineValue,
    });
}

function resolveEstimatedDateFields(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineDate: PhotoMetadataBlockRow['data']['estimated_date'] | undefined;
}) {
    return {
        displayLabel: resolveEstimatedDateDisplayLabel(params),
        mostLikelyDate: resolveEstimatedDateMostLikelyDate(params),
        minDate: resolveEstimatedDateMinDate(params),
        maxDate: resolveEstimatedDateMaxDate(params),
        rationale: resolveEstimatedDateRationale(params),
    };
}

function createEstimatedDateProvenance(
    source: PhotoMetadataFieldSource | undefined,
    fields: ReturnType<typeof resolveEstimatedDateFields>,
): PhotoMetadataEstimatedDateProvenance | undefined {
    return source
        ? {
            sourceKind: source.sourceKind,
            sourceId: source.sourceId,
            display_label: fields.displayLabel.source,
            most_likely_date: fields.mostLikelyDate.source,
            min_date: fields.minDate.source,
            max_date: fields.maxDate.source,
            rationale: fields.rationale.source,
        }
        : undefined;
}

export function resolveEstimatedDate(params: {
    blocks: PhotoMetadataBlockRow[];
    assertions: PhotoMetadataAssertionRow[];
}): {
    value: PhotoMetadataProjectionDate;
    provenance: PhotoMetadataEstimatedDateProvenance | undefined;
    source: PhotoMetadataFieldSource | undefined;
} {
    const machineBlock = pickMachineBlock(params.blocks);
    const dateAssertion = latestAssertion(params.assertions, (assertion) => assertion.field_path.startsWith('estimated_date.'));
    const fields = resolveEstimatedDateFields({
        assertions: params.assertions,
        machineBlock,
        machineDate: machineBlock?.data.estimated_date,
    });
    const source = topLevelGroupSource(machineBlock, dateAssertion, [fields.displayLabel, fields.mostLikelyDate, fields.minDate, fields.maxDate, fields.rationale]);
    return {
        value: {
            display_label: fields.displayLabel.value ?? '',
            most_likely_date: fields.mostLikelyDate.value,
            min_date: fields.minDate.value,
            max_date: fields.maxDate.value,
            rationale: fields.rationale.value,
        },
        provenance: createEstimatedDateProvenance(source, fields),
        source,
    };
}

function resolveQualityFields(params: {
    assertions: PhotoMetadataAssertionRow[];
    machineBlock: PhotoMetadataBlockRow | null;
    machineQuality: PhotoMetadataBlockRow['data']['quality'] | undefined;
}) {
    return {
        technical: resolveNumericField({
            assertions: params.assertions,
            fieldPath: 'quality.technical',
            machineBlock: params.machineBlock,
            machineValue: params.machineQuality ? params.machineQuality.technical : null,
        }),
        lighting: resolveNumericField({
            assertions: params.assertions,
            fieldPath: 'quality.lighting',
            machineBlock: params.machineBlock,
            machineValue: params.machineQuality ? params.machineQuality.lighting : null,
        }),
        composition: resolveNumericField({
            assertions: params.assertions,
            fieldPath: 'quality.composition',
            machineBlock: params.machineBlock,
            machineValue: params.machineQuality ? params.machineQuality.composition : null,
        }),
        emotional: resolveNumericField({
            assertions: params.assertions,
            fieldPath: 'quality.emotional',
            machineBlock: params.machineBlock,
            machineValue: params.machineQuality ? params.machineQuality.emotional : null,
        }),
        discard: resolveBooleanField({
            assertions: params.assertions,
            fieldPath: 'quality.discard',
            machineBlock: params.machineBlock,
            machineValue: params.machineQuality ? params.machineQuality.discard : null,
        }),
    };
}

function createQualityProvenance(
    source: PhotoMetadataFieldSource | undefined,
    fields: ReturnType<typeof resolveQualityFields>,
): PhotoMetadataQualityProvenance | undefined {
    return source
        ? {
            sourceKind: source.sourceKind,
            sourceId: source.sourceId,
            technical: fields.technical.source,
            lighting: fields.lighting.source,
            composition: fields.composition.source,
            emotional: fields.emotional.source,
            discard: fields.discard.source,
        }
        : undefined;
}

export function resolveQuality(params: {
    blocks: PhotoMetadataBlockRow[];
    assertions: PhotoMetadataAssertionRow[];
}): {
    value: PhotoMetadataProjectionQuality;
    provenance: PhotoMetadataQualityProvenance | undefined;
    source: PhotoMetadataFieldSource | undefined;
} {
    const machineBlock = pickMachineBlock(params.blocks);
    const qualityAssertion = latestAssertion(params.assertions, (assertion) => assertion.field_path.startsWith('quality.'));
    const fields = resolveQualityFields({
        assertions: params.assertions,
        machineBlock,
        machineQuality: machineBlock?.data.quality,
    });
    const source = topLevelGroupSource(machineBlock, qualityAssertion, [fields.technical, fields.lighting, fields.composition, fields.emotional, fields.discard]);
    return {
        value: {
            technical: fields.technical.value,
            lighting: fields.lighting.value,
            composition: fields.composition.value,
            emotional: fields.emotional.value,
            discard: fields.discard.value,
        },
        provenance: createQualityProvenance(source, fields),
        source,
    };
}

function createAuthenticityProvenance(
    source: PhotoMetadataFieldSource | undefined,
    score: ResolvedField<number | null>,
    reasons: ResolvedField<string[]>,
): PhotoMetadataAuthenticityProvenance | undefined {
    return source
        ? {
            sourceKind: source.sourceKind,
            sourceId: source.sourceId,
            score: score.source,
            reasons: reasons.source,
        }
        : undefined;
}

export function resolveAuthenticity(params: {
    blocks: PhotoMetadataBlockRow[];
    assertions: PhotoMetadataAssertionRow[];
}): {
    value: PhotoMetadataProjectionAuthenticity;
    provenance: PhotoMetadataAuthenticityProvenance | undefined;
    source: PhotoMetadataFieldSource | undefined;
} {
    const machineBlock = pickMachineBlock(params.blocks);
    const authenticityAssertion = latestAssertion(params.assertions, (assertion) => assertion.field_path.startsWith('authenticity.'));
    const machineAuthenticity = machineBlock?.data.authenticity;
    const score = resolveNumericField({
        assertions: params.assertions,
        fieldPath: 'authenticity.score',
        machineBlock,
        machineValue: machineAuthenticity ? machineAuthenticity.score : null,
    });
    const reasons = resolveFieldFromManualAndMachine({
        manualAssertion: latestAssertion(params.assertions, (assertion) => assertion.field_path === 'authenticity.reasons'),
        machineBlock,
        machineValue: machineAuthenticity ? machineAuthenticity.reasons : [],
        manualValue: (assertion) => toStringArray(assertion.value),
    });
    const source = topLevelGroupSource(machineBlock, authenticityAssertion, [score, reasons]);
    return {
        value: {
            score: score.value,
            reasons: reasons.value,
        },
        provenance: createAuthenticityProvenance(source, score, reasons),
        source,
    };
}

export function resolveSubjects(blocks: PhotoMetadataBlockRow[]): {
    value: PhotoMetadataSubject[];
    source: PhotoMetadataFieldSource | undefined;
} {
    const machineBlock = pickMachineBlock(blocks);
    return {
        value: machineBlock?.data.subjects ?? [],
        source: machineSource(machineBlock),
    };
}

export function resolveRegionsOfInterest(blocks: PhotoMetadataBlockRow[]): {
    value: PhotoMetadataRegionOfInterest[];
    source: PhotoMetadataFieldSource | undefined;
} {
    const machineBlock = pickMachineBlock(blocks);
    return {
        value: machineBlock?.data.regions_of_interest ?? [],
        source: machineSource(machineBlock),
    };
}
