export interface GenerateDateTagLabelsParams {
    photoCreatedAt: string | null;
    rangeStart: string | null;
    rangeEnd: string | null;
}

function parseDate(value: string | null) {
    if (!value) {return null;}
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCenturyLabel(year: number) {
    const century = Math.floor((year - 1) / 100) + 1;
    const suffix = century % 10 === 1 && century % 100 !== 11
        ? 'st'
        : century % 10 === 2 && century % 100 !== 12
            ? 'nd'
            : century % 10 === 3 && century % 100 !== 13
                ? 'rd'
                : 'th';
    return `${century}${suffix} century`;
}

function getDecadeLabel(year: number) {
    return `${Math.floor(year / 10) * 10}s`;
}

function getDecadePeriodLabel(year: number) {
    const decadeLabel = getDecadeLabel(year);
    const yearOffset = year % 10;
    if (yearOffset <= 3) {return `early ${decadeLabel}`;}
    if (yearOffset <= 6) {return `mid ${decadeLabel}`;}
    return `late ${decadeLabel}`;
}

function getSeasonLabel(month: number) {
    if (month >= 2 && month <= 4) {return 'spring';}
    if (month >= 5 && month <= 7) {return 'summer';}
    if (month >= 8 && month <= 10) {return 'autumn';}
    return 'winter';
}

function getRangeSeasonLabel(rangeStart: Date | null, rangeEnd: Date | null) {
    if (!rangeStart || !rangeEnd) {return null;}
    if (rangeStart.getUTCFullYear() !== rangeEnd.getUTCFullYear()) {return null;}

    const startSeason = getSeasonLabel(rangeStart.getUTCMonth());
    const endSeason = getSeasonLabel(rangeEnd.getUTCMonth());
    return startSeason === endSeason ? startSeason : null;
}

export function generateDateTagLabels(params: GenerateDateTagLabelsParams) {
    const photoCreatedAt = parseDate(params.photoCreatedAt);
    if (!photoCreatedAt) {return [] as string[];}

    const year = photoCreatedAt.getUTCFullYear();
    const seasonLabel = getRangeSeasonLabel(parseDate(params.rangeStart), parseDate(params.rangeEnd));

    return [
        getCenturyLabel(year),
        getDecadeLabel(year),
        getDecadePeriodLabel(year),
        String(year),
        ...(seasonLabel ? [seasonLabel] : []),
    ];
}
