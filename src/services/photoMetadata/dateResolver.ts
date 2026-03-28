import type { PhotoMetadataAssertionRow, PhotoMetadataBlockRow } from './repository';
import { normalizeIsoDateOrNull } from './validation';

export interface PhotoDateTimestampCandidate {
    source: string;
    value: string;
}

export interface PhotoDateSummary {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string;
    rationale: string | null;
}

export interface PhotoDateEvidenceMetadata {
    machineBlocks?: PhotoMetadataBlockRow[];
    manualAssertions?: PhotoMetadataAssertionRow[];
}

export interface ResolvePhotoDateEvidenceParams {
    originalPath: string;
    fileBirthtime?: string | null;
    embeddedMetadata?: Record<string, unknown> | null;
    aiMetadata?: Record<string, unknown> | null;
    metadataEvidence?: PhotoDateEvidenceMetadata | null;
}

export interface ResolvedPhotoDateEvidence {
    originalPath: string;
    fileBirthtime?: string | null;
    embeddedMetadata?: Record<string, unknown> | null;
    aiMetadata?: Record<string, unknown> | null;
}

interface PhotoDateSummaryParts {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string;
    rationale: string | null;
}

const MACHINE_SOURCE_RANKS: Record<string, number> = {
    gemini_pro_refined: 2,
    gemini_flash_scout: 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function normalizeSummaryDateHint(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function latestAssertion(assertions: PhotoMetadataAssertionRow[], fieldPath: string): PhotoMetadataAssertionRow | null {
    let winner: PhotoMetadataAssertionRow | null = null;
    for (const assertion of assertions) {
        if (assertion.field_path === fieldPath) {
            winner = assertion;
        }
    }
    return winner;
}

function latestAssertionValue(assertions: PhotoMetadataAssertionRow[], fieldPath: string): unknown {
    return latestAssertion(assertions, fieldPath)?.value ?? null;
}

function sourceRank(sourceKind: string): number {
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

function extractSummary(value: unknown): PhotoDateSummaryParts | null {
    if (!isRecord(value)) {
        return null;
    }

    const displayLabel = toNullableString(value.display_label);
    if (typeof displayLabel !== 'string' || displayLabel.trim().length === 0) {
        return null;
    }

    return {
        most_likely_date: normalizeSummaryDateHint(value.most_likely_date),
        min_date: normalizeSummaryDateHint(value.min_date),
        max_date: normalizeSummaryDateHint(value.max_date),
        display_label: displayLabel.trim(),
        rationale: toNullableString(value.rationale),
    };
}

function readMachineSummary(blocks: PhotoMetadataBlockRow[]): PhotoDateSummaryParts | null {
    return extractSummary(pickMachineBlock(blocks)?.data.estimated_date);
}

function hasSummaryContent(parts: {
    displayLabel: string | null;
    mostLikelyDate: string | null;
    minDate: string | null;
    maxDate: string | null;
}): boolean {
    return Boolean(
        parts.displayLabel
        || parts.mostLikelyDate
        || parts.minDate
        || parts.maxDate
    );
}

function readManualSummary(assertions: PhotoMetadataAssertionRow[]): PhotoDateSummaryParts | null {
    const resolvedDisplayLabel = toNullableString(latestAssertionValue(assertions, 'estimated_date.display_label'));
    const resolvedMostLikelyDate = normalizeSummaryDateHint(latestAssertionValue(assertions, 'estimated_date.most_likely_date'));
    const resolvedMinDate = normalizeSummaryDateHint(latestAssertionValue(assertions, 'estimated_date.min_date'));
    const resolvedMaxDate = normalizeSummaryDateHint(latestAssertionValue(assertions, 'estimated_date.max_date'));
    if (!hasSummaryContent({
        displayLabel: resolvedDisplayLabel,
        mostLikelyDate: resolvedMostLikelyDate,
        minDate: resolvedMinDate,
        maxDate: resolvedMaxDate,
    })) {
        return null;
    }

    return {
        most_likely_date: resolvedMostLikelyDate,
        min_date: resolvedMinDate,
        max_date: resolvedMaxDate,
        display_label: resolvedDisplayLabel?.trim() ?? resolvedMostLikelyDate ?? resolvedMinDate ?? resolvedMaxDate ?? '',
        rationale: toNullableString(latestAssertionValue(assertions, 'estimated_date.rationale')),
    };
}

function chooseSummaryValue<T>(...values: Array<T | null | undefined>): T | null {
    for (const value of values) {
        if (value !== null && value !== undefined) {
            return value;
        }
    }

    return null;
}

function mergeSummaryField(
    manualValue: string | null | undefined,
    machineValue: string | null | undefined,
    existingValue: string | null | undefined,
    fallback: string | null,
): string | null {
    return chooseSummaryValue(manualValue, machineValue, existingValue) ?? fallback;
}

function getSummaryField(
    summary: PhotoDateSummaryParts | null,
    field: keyof PhotoDateSummaryParts,
): string | null {
    return summary ? summary[field] : null;
}

function createTimestampCandidate(sourcePrefix: string, sourceId: string, fieldName: string, value: unknown): PhotoDateTimestampCandidate | null {
    const normalized = normalizeIsoDateOrNull(value);
    if (!normalized) {
        return null;
    }

    return {
        source: `${sourcePrefix}:${sourceId}.${fieldName}`,
        value: normalized,
    };
}

function collectMachineCandidates(blocks: PhotoMetadataBlockRow[]): PhotoDateTimestampCandidate[] {
    const candidates: PhotoDateTimestampCandidate[] = [];
    for (const block of blocks) {
        const estimatedDate = block.data.estimated_date;
        candidates.push(
            ...[
                createTimestampCandidate('machine', block.id, 'estimated_date.most_likely_date', estimatedDate.most_likely_date),
            ].filter((candidate): candidate is PhotoDateTimestampCandidate => candidate !== null),
        );
    }

    return candidates;
}

function collectManualCandidates(assertions: PhotoMetadataAssertionRow[]): PhotoDateTimestampCandidate[] {
    const candidates: PhotoDateTimestampCandidate[] = [];
    for (const assertion of assertions) {
        if (assertion.field_path === 'estimated_date.most_likely_date') {
            const candidate = createTimestampCandidate('manual', assertion.id, 'estimated_date.most_likely_date', assertion.value);
            if (candidate) {
                candidates.push(candidate);
            }
        }
    }

    return candidates;
}

function mergeDerivedTimestampCandidates(
    existingCandidates: unknown,
    candidates: PhotoDateTimestampCandidate[],
): PhotoDateTimestampCandidate[] {
    const existing = Array.isArray(existingCandidates)
        ? existingCandidates.filter((candidate): candidate is PhotoDateTimestampCandidate => (
            isRecord(candidate)
            && typeof candidate.source === 'string'
            && typeof candidate.value === 'string'
            && normalizeIsoDateOrNull(candidate.value) !== null
        )).map((candidate) => ({
            source: candidate.source,
            value: candidate.value,
        }))
        : [];

    return [...existing, ...candidates];
}

function mergeEmbeddedMetadata(
    embeddedMetadata: Record<string, unknown> | null | undefined,
    candidates: PhotoDateTimestampCandidate[],
): Record<string, unknown> | null {
    const derived = isRecord(embeddedMetadata?.derived) ? embeddedMetadata.derived : {};
    return {
        ...embeddedMetadata,
        derived: {
            ...derived,
            timestamp_candidates: mergeDerivedTimestampCandidates(derived.timestamp_candidates, candidates),
        },
    };
}

function mergeEstimatedDateSummary(
    current: unknown,
    machineSummary: PhotoDateSummaryParts | null,
    manualSummary: PhotoDateSummaryParts | null,
): PhotoDateSummary {
    const existing = extractSummary(current);
    return {
        most_likely_date: mergeSummaryField(
            getSummaryField(manualSummary, 'most_likely_date'),
            getSummaryField(machineSummary, 'most_likely_date'),
            getSummaryField(existing, 'most_likely_date'),
            null,
        ),
        min_date: mergeSummaryField(
            getSummaryField(manualSummary, 'min_date'),
            getSummaryField(machineSummary, 'min_date'),
            getSummaryField(existing, 'min_date'),
            null,
        ),
        max_date: mergeSummaryField(
            getSummaryField(manualSummary, 'max_date'),
            getSummaryField(machineSummary, 'max_date'),
            getSummaryField(existing, 'max_date'),
            null,
        ),
        display_label: mergeSummaryField(
            getSummaryField(manualSummary, 'display_label'),
            getSummaryField(machineSummary, 'display_label'),
            getSummaryField(existing, 'display_label'),
            '',
        ) ?? '',
        rationale: mergeSummaryField(
            getSummaryField(manualSummary, 'rationale'),
            getSummaryField(machineSummary, 'rationale'),
            getSummaryField(existing, 'rationale'),
            null,
        ),
    };
}

export function resolvePhotoDateEvidence(params: ResolvePhotoDateEvidenceParams): ResolvedPhotoDateEvidence {
    const machineBlocks = params.metadataEvidence?.machineBlocks ?? [];
    const manualAssertions = params.metadataEvidence?.manualAssertions ?? [];
    const machineSummary = readMachineSummary(machineBlocks);
    const manualSummary = readManualSummary(manualAssertions);
    const candidates = [
        ...collectMachineCandidates(machineBlocks),
        ...collectManualCandidates(manualAssertions),
    ];

    return {
        originalPath: params.originalPath,
        fileBirthtime: params.fileBirthtime ?? null,
        embeddedMetadata: mergeEmbeddedMetadata(params.embeddedMetadata ?? null, candidates),
        aiMetadata: {
            ...params.aiMetadata,
            estimated_date: mergeEstimatedDateSummary(
                params.aiMetadata?.estimated_date,
                machineSummary,
                manualSummary,
            ),
        },
    };
}
