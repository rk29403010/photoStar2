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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
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

function extractSummary(value: unknown): PhotoDateSummaryParts | null {
    if (!isRecord(value)) {
        return null;
    }

    const displayLabel = toNullableString(value.display_label);
    if (typeof displayLabel !== 'string' || displayLabel.trim().length === 0) {
        return null;
    }

    return {
        most_likely_date: normalizeIsoDateOrNull(value.most_likely_date),
        min_date: normalizeIsoDateOrNull(value.min_date),
        max_date: normalizeIsoDateOrNull(value.max_date),
        display_label: displayLabel.trim(),
        rationale: toNullableString(value.rationale),
    };
}

function readMachineSummary(blocks: PhotoMetadataBlockRow[]): PhotoDateSummaryParts | null {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const summary = extractSummary(blocks[index]?.data.estimated_date);
        if (summary) {
            return summary;
        }
    }

    return null;
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
    const resolvedMostLikelyDate = normalizeIsoDateOrNull(latestAssertionValue(assertions, 'estimated_date.most_likely_date'));
    const resolvedMinDate = normalizeIsoDateOrNull(latestAssertionValue(assertions, 'estimated_date.min_date'));
    const resolvedMaxDate = normalizeIsoDateOrNull(latestAssertionValue(assertions, 'estimated_date.max_date'));
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
    const summary = manualSummary ?? machineSummary ?? existing;

    if (summary) {
        return {
            most_likely_date: summary.most_likely_date,
            min_date: summary.min_date,
            max_date: summary.max_date,
            display_label: summary.display_label,
            rationale: summary.rationale,
        };
    }

    return {
        most_likely_date: null,
        min_date: null,
        max_date: null,
        display_label: '',
        rationale: null,
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
