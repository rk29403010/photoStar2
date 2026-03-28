import {
    buildRepresentativeMs,
    collectSignals,
    detectMetadataProfile,
    overlaps,
    toIsoString,
    toSerializableSignal,
    type MetadataProfile,
    type PhotoDateSignal,
    type SignalWindow,
    type TimeRange,
} from './photoDateEstimateShared';

export interface PhotoDateEstimateResult {
    schema_version: 1;
    photoCreatedAt: string;
    range: {
        start: string;
        end: string;
    };
    confidence: {
        score: number;
        reasons: string[];
    };
    signals: PhotoDateSignal[];
}

export interface EstimatePhotoDateParams {
    originalPath: string;
    fileBirthtime?: string | null;
    embeddedMetadata?: Record<string, unknown> | null;
    aiMetadata?: Record<string, unknown> | null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toDateOnlySignalText(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length <= 10) {
        return trimmed;
    }
    return trimmed.slice(0, 10);
}

function normalizeExactSignalValue(value: string): string {
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}T/.test(trimmed)
        ? toDateOnlySignalText(trimmed)
        : trimmed;
}

function extractEstimatedDateRangeText(estimatedDate: Record<string, unknown>): string | null {
    const minDate = estimatedDate.min_date;
    const maxDate = estimatedDate.max_date;
    if (
        typeof minDate === 'string'
        && minDate.trim().length > 0
        && typeof maxDate === 'string'
        && maxDate.trim().length > 0
    ) {
        const minYear = new Date(minDate.trim()).getUTCFullYear();
        const maxYear = new Date(maxDate.trim()).getUTCFullYear();
        if (Number.isFinite(minYear) && Number.isFinite(maxYear) && minYear !== maxYear) {
            return `${minYear}s-${maxYear}s`;
        }
    }

    return null;
}

function extractEstimatedDateExactText(estimatedDate: Record<string, unknown>): string | null {
    const mostLikelyDate = estimatedDate.most_likely_date;
    if (typeof mostLikelyDate === 'string' && mostLikelyDate.trim().length > 0) {
        return normalizeExactSignalValue(mostLikelyDate);
    }

    return null;
}

function extractEstimatedDateLabelText(estimatedDate: Record<string, unknown>): string | null {
    const displayLabel = estimatedDate.display_label;
    if (typeof displayLabel === 'string' && displayLabel.trim().length > 0) {
        return displayLabel.trim();
    }

    return null;
}

function extractStructuredEstimatedDateText(estimatedDate: Record<string, unknown>): string | null {
    return extractEstimatedDateExactText(estimatedDate)
        ?? extractEstimatedDateRangeText(estimatedDate)
        ?? extractEstimatedDateLabelText(estimatedDate);
}

function scoreSignal(anchor: SignalWindow, signals: SignalWindow[]): number {
    return signals.reduce((total, signal) => (
        overlaps(anchor, signal) ? total + signal.weight : total
    ), anchor.weight);
}

function chooseAnchorSignal(signals: SignalWindow[]): SignalWindow {
    return signals.reduce((bestSignal, signal) => {
        const bestScore = scoreSignal(bestSignal, signals);
        const signalScore = scoreSignal(signal, signals);
        if (signalScore !== bestScore) {
            return signalScore > bestScore ? signal : bestSignal;
        }
        if (signal.weight !== bestSignal.weight) {
            return signal.weight > bestSignal.weight ? signal : bestSignal;
        }
        return signal.startMs < bestSignal.startMs ? signal : bestSignal;
    }, signals[0]);
}

function computeConsensusRange(anchor: SignalWindow, signals: SignalWindow[]): TimeRange {
    const cluster = signals.filter((signal) => overlaps(signal, anchor));
    const startMs = Math.max(...cluster.map((signal) => signal.startMs));
    const endMs = Math.min(...cluster.map((signal) => signal.endMs));
    return startMs <= endMs ? { startMs, endMs } : { startMs: anchor.startMs, endMs: anchor.endMs };
}

function resolvePhotoCreatedAt(range: TimeRange, anchor: SignalWindow, signals: SignalWindow[]): number {
    const exactSignals = signals.filter((signal) => (
        signal.precision === 'exact'
        && signal.representativeMs >= range.startMs
        && signal.representativeMs <= range.endMs
    ));
    if (exactSignals.length === 0) {
        return anchor.precision === 'year'
            ? Date.UTC(new Date(range.startMs).getUTCFullYear(), 6, 1, 0, 0, 0, 0)
            : buildRepresentativeMs(range);
    }

    const totalWeight = exactSignals.reduce((total, signal) => total + signal.weight, 0);
    if (totalWeight <= 0) {
        return anchor.representativeMs;
    }

    const weightedMs = exactSignals.reduce((total, signal) => (
        total + (signal.representativeMs * signal.weight)
    ), 0) / totalWeight;
    return Math.min(range.endMs, Math.max(range.startMs, Math.round(weightedMs)));
}

function calculatePrecisionScore(range: TimeRange): number {
    const widthMs = range.endMs - range.startMs;
    if (widthMs <= 0) {
        return 0.95;
    }
    if (widthMs <= 31 * 24 * 60 * 60 * 1000) {
        return 0.9;
    }
    if (widthMs <= 366 * 24 * 60 * 60 * 1000) {
        return 0.72;
    }
    if (widthMs <= (10 * YEAR_MS)) {
        return 0.5;
    }
    return 0.36;
}

function calculateAgreementScore(cluster: SignalWindow[], signals: SignalWindow[]): number {
    const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
    if (totalWeight <= 0) {
        return 0.5;
    }
    const clusterWeight = cluster.reduce((sum, signal) => sum + signal.weight, 0);
    return Math.min(1, clusterWeight / totalWeight);
}

function getYearDistance(leftMs: number, rightMs: number): number {
    return Math.abs(new Date(leftMs).getUTCFullYear() - new Date(rightMs).getUTCFullYear());
}

function extractEstimatedDateText(aiMetadata: Record<string, unknown> | null | undefined): string | null {
    const estimatedDate = aiMetadata?.estimated_date;
    if (typeof estimatedDate === 'string') {
        const trimmed = estimatedDate.trim();
        return trimmed.length > 0 ? normalizeExactSignalValue(trimmed) : null;
    }
    if (!isRecord(estimatedDate)) {
        return null;
    }

    return extractStructuredEstimatedDateText(estimatedDate);
}

function hasStrongDisagreements(anchor: SignalWindow, signals: SignalWindow[]): boolean {
    return signals.some((signal) => (
        !overlaps(signal, anchor)
        && signal.weight >= 0.22
        && getYearDistance(signal.representativeMs, anchor.representativeMs) >= 20
    ));
}

function applyProfileConfidenceAdjustments(params: {
    metadataProfile: MetadataProfile;
    anchor: SignalWindow;
    reasons: string[];
    score: number;
}): number {
    const { metadataProfile, anchor, reasons } = params;
    let score = params.score;
    if (metadataProfile === 'scanner') {
        reasons.push('scanner/editor metadata was detected, so embedded timestamps were treated as weak clues');
        score -= 0.06;
        if (anchor.origin === 'ai' || anchor.origin === 'filename') {
            score += 0.08;
        }
    }
    if (metadataProfile === 'born_digital') {
        reasons.push('camera/phone metadata suggests a born-digital capture');
        if (anchor.origin === 'embedded' || anchor.origin === 'file') {
            score += 0.08;
        }
    }
    return score;
}

function buildConfidence(params: {
    metadataProfile: MetadataProfile;
    anchor: SignalWindow;
    range: TimeRange;
    signals: SignalWindow[];
}): { score: number; reasons: string[] } {
    const { metadataProfile, anchor, range, signals } = params;
    const cluster = signals.filter((signal) => overlaps(signal, anchor));
    const reasons: string[] = [];
    let score = 0.24
        + (calculatePrecisionScore(range) * 0.34)
        + (calculateAgreementScore(cluster, signals) * 0.24);

    score = applyProfileConfidenceAdjustments({ metadataProfile, anchor, reasons, score });

    if (hasStrongDisagreements(anchor, signals)) {
        reasons.push('high-value signals disagrees materially with the winning date, so confidence was reduced');
        score -= 0.18;
    }

    if (cluster.length >= 2) {
        reasons.push('multiple independent signals overlap');
        score += 0.04;
    }

    return {
        score: Math.max(0.05, Math.min(0.98, Number(score.toFixed(3)))),
        reasons,
    };
}

export function estimatePhotoDate(params: EstimatePhotoDateParams): PhotoDateEstimateResult {
    const aiMetadata = params.aiMetadata
        ? {
            ...params.aiMetadata,
            estimated_date: extractEstimatedDateText(params.aiMetadata),
        }
        : null;
    const metadataProfile = detectMetadataProfile(params.embeddedMetadata ?? null);
    const signals = collectSignals({
        ...params,
        aiMetadata,
        metadataProfile,
    });
    if (signals.length === 0) {
        throw new Error(`Unable to estimate photo date for '${params.originalPath}' because no date signals were available.`);
    }

    const anchor = chooseAnchorSignal(signals);
    const range = computeConsensusRange(anchor, signals);
    const overlappingSignals = signals.filter((signal) => overlaps(signal, anchor));
    const photoCreatedAtMs = resolvePhotoCreatedAt(range, anchor, overlappingSignals);

    return {
        schema_version: 1,
        photoCreatedAt: toIsoString(photoCreatedAtMs),
        range: {
            start: toIsoString(range.startMs),
            end: toIsoString(range.endMs),
        },
        confidence: buildConfidence({
            metadataProfile,
            anchor,
            range,
            signals,
        }),
        signals: signals.map(toSerializableSignal),
    };
}
