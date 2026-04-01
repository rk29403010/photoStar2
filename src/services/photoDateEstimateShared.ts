import { basename } from 'node:path';
import { getEmbeddedTimestampWeight } from './photoDateEstimateEmbeddedWeights';
import { rebalanceSignalsForMetadataProfile } from './photoDateEstimateSignalBalance';

export type SignalOrigin = 'embedded' | 'filename' | 'ai' | 'file';
export type SignalPrecision = 'exact' | 'year' | 'decade' | 'range';
export type MetadataProfile = 'born_digital' | 'scanner' | 'unknown';

type RawTimestampCandidate = {
    source?: unknown;
    value?: unknown;
};

export interface PhotoDateSignal {
    source: string;
    origin: SignalOrigin;
    label: string;
    precision: SignalPrecision;
    start: string;
    end: string;
    representativeAt: string;
    weight: number;
}

export type SignalWindow = {
    origin: SignalOrigin;
    source: string;
    label: string;
    precision: SignalPrecision;
    startMs: number;
    endMs: number;
    representativeMs: number;
    weight: number;
};

export type TimeRange = {
    startMs: number;
    endMs: number;
};

type SignalCollectionContext = {
    originalPath: string;
    fileBirthtime?: string | null;
    embeddedMetadata?: Record<string, unknown> | null;
    aiMetadata?: Record<string, unknown> | null;
    metadataProfile: MetadataProfile;
};

type WeightProfile = {
    embedded: number;
    file: number;
    filenameExact: number;
    filenameYear: number;
    filenameDecade: number;
    aiExact: number;
    aiYear: number;
    aiDecade: number;
    aiRange: number;
};

const BORN_DIGITAL_KEYWORDS = [
    'apple',
    'iphone',
    'ipad',
    'pixel',
    'google',
    'samsung',
    'canon',
    'nikon',
    'sony',
    'fujifilm',
    'olympus',
    'panasonic',
    'lumix',
    'gopro',
    'xiaomi',
    'huawei',
    'oneplus',
    'motorola',
];
const SCANNER_KEYWORDS = [
    'scanner',
    'scan',
    'windows photo editor',
    'photoshop',
    'silverfast',
    'vuescan',
    'epson scan',
    'acrobat',
    'paintshop',
    'gimp',
];
const UNKNOWN_WEIGHTS: WeightProfile = {
    embedded: 0.58,
    file: 0.2,
    filenameExact: 0.95,
    filenameYear: 0.82,
    filenameDecade: 0.56,
    aiExact: 0.7,
    aiYear: 0.64,
    aiDecade: 0.48,
    aiRange: 0.56,
};
const BORN_DIGITAL_WEIGHTS: WeightProfile = {
    embedded: 1.0,
    file: 0.82,
    filenameExact: 0.72,
    filenameYear: 0.66,
    filenameDecade: 0.34,
    aiExact: 0.32,
    aiYear: 0.28,
    aiDecade: 0.22,
    aiRange: 0.26,
};
const SCANNER_WEIGHTS: WeightProfile = {
    embedded: 0.18,
    file: 0.08,
    filenameExact: 1.0,
    filenameYear: 0.92,
    filenameDecade: 0.7,
    aiExact: 0.82,
    aiYear: 0.84,
    aiDecade: 0.88,
    aiRange: 0.92,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toIsoString(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

function isValidUtcDate(year: number, month: number, day: number): boolean {
    const value = new Date(Date.UTC(year, month - 1, day));
    return value.getUTCFullYear() === year
        && value.getUTCMonth() === month - 1
        && value.getUTCDate() === day;
}

function buildDayRange(year: number, month: number, day: number): TimeRange {
    return {
        startMs: Date.UTC(year, month - 1, day, 0, 0, 0, 0),
        endMs: Date.UTC(year, month - 1, day, 23, 59, 59, 999),
    };
}

export function buildYearRange(year: number): TimeRange {
    return {
        startMs: Date.UTC(year, 0, 1, 0, 0, 0, 0),
        endMs: Date.UTC(year, 11, 31, 23, 59, 59, 999),
    };
}

function buildDecadeRange(decadeStartYear: number): TimeRange {
    return {
        startMs: Date.UTC(decadeStartYear, 0, 1, 0, 0, 0, 0),
        endMs: Date.UTC(decadeStartYear + 9, 11, 31, 23, 59, 59, 999),
    };
}

function buildCombinedRange(startYear: number, endYear: number): TimeRange {
    return {
        startMs: Date.UTC(startYear, 0, 1, 0, 0, 0, 0),
        endMs: Date.UTC(endYear, 11, 31, 23, 59, 59, 999),
    };
}

export function buildRepresentativeMs(range: TimeRange): number {
    return Math.floor(range.startMs + ((range.endMs - range.startMs) / 2));
}

function buildSignal(params: {
    origin: SignalOrigin;
    source: string;
    label: string;
    precision: SignalPrecision;
    range: TimeRange;
    weight: number;
    representativeMs?: number;
}): SignalWindow {
    return {
        origin: params.origin,
        source: params.source,
        label: params.label,
        precision: params.precision,
        startMs: params.range.startMs,
        endMs: params.range.endMs,
        representativeMs: params.representativeMs ?? buildRepresentativeMs(params.range),
        weight: params.weight,
    };
}

function parseIsoTimestamp(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }

    const timestampMs = Date.parse(value);
    return Number.isNaN(timestampMs) ? null : timestampMs;
}

function tryBuildExactSignal(params: {
    origin: SignalOrigin;
    source: string;
    label: string;
    value: unknown;
    weight: number;
}): SignalWindow | null {
    const timestampMs = parseIsoTimestamp(params.value);
    if (timestampMs === null) {
        return null;
    }

    return buildSignal({
        origin: params.origin,
        source: params.source,
        label: params.label,
        precision: 'exact',
        range: { startMs: timestampMs, endMs: timestampMs },
        weight: params.weight,
        representativeMs: timestampMs,
    });
}

function normaliseTwoDigitYear(twoDigitYear: number): number {
    return twoDigitYear >= 30 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
}

function flattenTextValues(value: unknown): string[] {
    if (typeof value === 'string') {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => flattenTextValues(entry));
    }
    if (isRecord(value)) {
        return Object.values(value).flatMap((entry) => flattenTextValues(entry));
    }
    return [];
}

export function detectMetadataProfile(embeddedMetadata: Record<string, unknown> | null | undefined): MetadataProfile {
    if (!embeddedMetadata) {
        return 'unknown';
    }

    const embeddedValues = isRecord(embeddedMetadata.embedded)
        ? flattenTextValues(embeddedMetadata.embedded).map((value) => value.toLowerCase())
        : [];
    const combined = embeddedValues.join(' ');
    if (SCANNER_KEYWORDS.some((keyword) => combined.includes(keyword))) {
        return 'scanner';
    }
    if (BORN_DIGITAL_KEYWORDS.some((keyword) => combined.includes(keyword))) {
        return 'born_digital';
    }
    return 'unknown';
}

function getWeights(profile: MetadataProfile): WeightProfile {
    if (profile === 'born_digital') {
        return BORN_DIGITAL_WEIGHTS;
    }
    if (profile === 'scanner') {
        return SCANNER_WEIGHTS;
    }
    return UNKNOWN_WEIGHTS;
}

function isWhatsAppExportStem(stem: string): boolean {
    return /^whatsapp image \d{4}-\d{2}-\d{2} at \d{2}\.\d{2}\.\d{2}/i.test(stem);
}

function addUniqueSignal(signals: SignalWindow[], seen: Set<string>, signal: SignalWindow | null) {
    if (!signal) {
        return;
    }
    const key = `${signal.source}:${signal.startMs}:${signal.endMs}`;
    if (seen.has(key)) {
        return;
    }
    seen.add(key);
    signals.push(signal);
}

function collectFullDateFilenameSignals(stem: string, weights: WeightProfile, signals: SignalWindow[], seen: Set<string>) {
    for (const match of stem.matchAll(/\b((?:19|20)\d{2})[-_ ]?(\d{2})[-_ ]?(\d{2})\b/g)) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!isValidUtcDate(year, month, day)) {
            continue;
        }
        const range = buildDayRange(year, month, day);
        addUniqueSignal(signals, seen, buildSignal({
            origin: 'filename',
            source: 'filename.full_date',
            label: `Filename date ${match[0]}`,
            precision: 'exact',
            range,
            representativeMs: range.startMs,
            weight: weights.filenameExact,
        }));
    }
}

function collectDecadeFilenameSignals(stem: string, weights: WeightProfile, signals: SignalWindow[], seen: Set<string>) {
    for (const match of stem.matchAll(/\b((?:18|19|20)\d{2})s\b/gi)) {
        addUniqueSignal(signals, seen, buildSignal({
            origin: 'filename',
            source: 'filename.decade',
            label: `Filename decade ${match[0]}`,
            precision: 'decade',
            range: buildDecadeRange(Number(match[1])),
            weight: weights.filenameDecade,
        }));
    }
}

function collectYearFilenameSignals(stem: string, weights: WeightProfile, signals: SignalWindow[], seen: Set<string>) {
    for (const match of stem.matchAll(/\b((?:19|20)\d{2})\b/g)) {
        addUniqueSignal(signals, seen, buildSignal({
            origin: 'filename',
            source: 'filename.year',
            label: `Filename year ${match[0]}`,
            precision: 'year',
            range: buildYearRange(Number(match[1])),
            weight: weights.filenameYear,
        }));
    }
}

function collectTwoDigitYearFilenameSignals(stem: string, weights: WeightProfile, signals: SignalWindow[], seen: Set<string>) {
    for (const token of stem.split(/[^0-9']+/).filter((value) => value.length > 0)) {
        const match = token.match(/^'?(\d{2})$/);
        if (!match) {
            continue;
        }
        addUniqueSignal(signals, seen, buildSignal({
            origin: 'filename',
            source: 'filename.two_digit_year',
            label: `Filename year ${token}`,
            precision: 'year',
            range: buildYearRange(normaliseTwoDigitYear(Number(match[1]))),
            weight: weights.filenameYear * 0.72,
        }));
    }
}

function collectFilenameSignals(
    originalPath: string,
    weights: WeightProfile,
    metadataProfile: MetadataProfile,
): SignalWindow[] {
    const stem = basename(originalPath).replace(/\.[^.]+$/, '');
    if (isWhatsAppExportStem(stem)) {
        return [];
    }

    const signals: SignalWindow[] = [];
    const seen = new Set<string>();
    collectFullDateFilenameSignals(stem, weights, signals, seen);
    collectDecadeFilenameSignals(stem, weights, signals, seen);
    collectYearFilenameSignals(stem, weights, signals, seen);
    if (metadataProfile !== 'scanner') {
        collectTwoDigitYearFilenameSignals(stem, weights, signals, seen);
    }

    return signals;
}

function extractEstimatedDateText(aiMetadata: Record<string, unknown> | null | undefined): string | null {
    const estimatedDate = aiMetadata?.estimated_date;
    return typeof estimatedDate === 'string' && estimatedDate.trim().length > 0 ? estimatedDate.trim() : null;
}

function collectAiSignals(aiMetadata: Record<string, unknown> | null | undefined, weights: WeightProfile): SignalWindow[] {
    const estimatedDate = extractEstimatedDateText(aiMetadata);
    if (!estimatedDate) {
        return [];
    }

    const exactDateMatch = estimatedDate.match(/\b((?:18|19|20)\d{2})[-/:](\d{2})[-/:](\d{2})\b/);
    if (exactDateMatch) {
        const year = Number(exactDateMatch[1]);
        const month = Number(exactDateMatch[2]);
        const day = Number(exactDateMatch[3]);
        if (isValidUtcDate(year, month, day)) {
            const range = buildDayRange(year, month, day);
            return [buildSignal({
                origin: 'ai',
                source: 'ai.estimated_date.exact',
                label: `AI date ${estimatedDate}`,
                precision: 'exact',
                range,
                representativeMs: range.startMs,
                weight: weights.aiExact,
            })];
        }
    }

    const decadeRangeMatch = estimatedDate.match(/\b((?:18|19|20)\d{2})s\s*[-/]\s*((?:18|19|20)\d{2})s\b/i);
    if (decadeRangeMatch) {
        return [buildSignal({
            origin: 'ai',
            source: 'ai.estimated_date.range',
            label: `AI range ${estimatedDate}`,
            precision: 'range',
            range: buildCombinedRange(Number(decadeRangeMatch[1]), Number(decadeRangeMatch[2]) + 9),
            weight: weights.aiRange,
        })];
    }

    const decadeMatch = estimatedDate.match(/\b((?:18|19|20)\d{2})s\b/i);
    if (decadeMatch) {
        return [buildSignal({
            origin: 'ai',
            source: 'ai.estimated_date.decade',
            label: `AI decade ${estimatedDate}`,
            precision: 'decade',
            range: buildDecadeRange(Number(decadeMatch[1])),
            weight: weights.aiDecade,
        })];
    }

    const yearMatch = estimatedDate.match(/\b((?:18|19|20)\d{2})\b/);
    if (!yearMatch) {
        return [];
    }

    return [buildSignal({
        origin: 'ai',
        source: 'ai.estimated_date.year',
        label: `AI year ${estimatedDate}`,
        precision: 'year',
        range: buildYearRange(Number(yearMatch[1])),
        weight: weights.aiYear,
    })];
}

function getEmbeddedTimestampCandidates(embeddedMetadata: Record<string, unknown> | null | undefined): RawTimestampCandidate[] {
    if (!embeddedMetadata || !isRecord(embeddedMetadata.derived)) {
        return [];
    }

    const timestampCandidates = embeddedMetadata.derived.timestamp_candidates;
    return Array.isArray(timestampCandidates) ? timestampCandidates : [];
}

function collectEmbeddedSignals(embeddedMetadata: Record<string, unknown> | null | undefined, weights: WeightProfile): SignalWindow[] {
    return getEmbeddedTimestampCandidates(embeddedMetadata)
        .map((candidate, index) => {
            const source = typeof candidate.source === 'string'
                ? candidate.source
                : `embedded.timestamp_candidate_${index + 1}`;

            return tryBuildExactSignal({
                origin: 'embedded',
                source,
                label: typeof candidate.source === 'string' ? `Embedded timestamp ${candidate.source}` : 'Embedded timestamp',
                value: candidate.value,
                weight: getEmbeddedTimestampWeight(source, weights.embedded),
            });
        })
        .filter((signal): signal is SignalWindow => signal !== null);
}

function collectFileSignal(fileBirthtime: string | null | undefined, weights: WeightProfile): SignalWindow[] {
    const signal = tryBuildExactSignal({
        origin: 'file',
        source: 'file.birthtime',
        label: 'File birth time',
        value: fileBirthtime,
        weight: weights.file,
    });
    return signal ? [signal] : [];
}

export function collectSignals(params: SignalCollectionContext): SignalWindow[] {
    const weights = getWeights(params.metadataProfile);
    const signals = [
        ...collectEmbeddedSignals(params.embeddedMetadata ?? null, weights),
        ...collectFilenameSignals(params.originalPath, weights, params.metadataProfile),
        ...collectAiSignals(params.aiMetadata ?? null, weights),
        ...collectFileSignal(params.fileBirthtime ?? null, weights),
    ];

    return rebalanceSignalsForMetadataProfile({
        metadataProfile: params.metadataProfile,
        signals,
    });
}

export function overlaps(left: SignalWindow, right: SignalWindow): boolean {
    return left.startMs <= right.endMs && right.startMs <= left.endMs;
}

export function toSerializableSignal(signal: SignalWindow): PhotoDateSignal {
    return {
        source: signal.source,
        origin: signal.origin,
        label: signal.label,
        precision: signal.precision,
        start: toIsoString(signal.startMs),
        end: toIsoString(signal.endMs),
        representativeAt: toIsoString(signal.representativeMs),
        weight: signal.weight,
    };
}
