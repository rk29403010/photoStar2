import type { Asset, PhotoDateEstimateArtifact, PhotoDateEstimateSignal } from '@contracts/core';

export type PhotoDateDiagnosticSignalSummary = {
    label: string;
    originLabel: string;
    precisionLabel: string;
    weightLabel: string;
}

export type PhotoDateDiagnosticsSummary = {
    confidenceLabel: string | null;
    rangeLabel: string | null;
    reasons: string[];
    signals: PhotoDateDiagnosticSignalSummary[];
}

function toDateOnly(value: string): string {
    return value.slice(0, 10);
}

function getOriginLabel(origin: PhotoDateEstimateSignal['origin']): string {
    switch (origin) {
        case 'ai':
            return 'AI';
        case 'embedded':
            return 'Embedded';
        case 'filename':
            return 'Filename';
        case 'file':
            return 'File';
    }
}

function getPrecisionLabel(precision: PhotoDateEstimateSignal['precision']): string {
    switch (precision) {
        case 'exact':
            return 'Exact';
        case 'year':
            return 'Year';
        case 'decade':
            return 'Decade';
        case 'range':
            return 'Range';
    }
}

function getEstimate(asset: Asset): PhotoDateEstimateArtifact | undefined {
    return asset.photo_date_estimate;
}

function sortSignals(signals: PhotoDateEstimateSignal[]): PhotoDateEstimateSignal[] {
    return [...signals].sort((left, right) => {
        if (right.weight !== left.weight) {
            return right.weight - left.weight;
        }
        return left.label.localeCompare(right.label);
    });
}

export function buildPhotoDateDiagnosticsSummary(asset: Asset): PhotoDateDiagnosticsSummary {
    const estimate = getEstimate(asset);
    if (!estimate) {
        return {
            confidenceLabel: null,
            rangeLabel: null,
            reasons: [],
            signals: [],
        };
    }

    return {
        confidenceLabel: `${Math.round(estimate.confidence.score * 100)}%`,
        rangeLabel: `${toDateOnly(estimate.range.start)} to ${toDateOnly(estimate.range.end)}`,
        reasons: estimate.confidence.reasons,
        signals: sortSignals(estimate.signals).map((signal) => ({
            label: signal.label,
            originLabel: getOriginLabel(signal.origin),
            precisionLabel: getPrecisionLabel(signal.precision),
            weightLabel: signal.weight.toFixed(2),
        })),
    };
}
