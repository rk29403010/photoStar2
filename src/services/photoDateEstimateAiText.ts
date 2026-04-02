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

export function extractEstimatedDateText(aiMetadata: Record<string, unknown> | null | undefined): string | null {
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
