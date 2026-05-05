import {
    formatAssetDiagnosticLabel,
    getDiagnosticFilename,
    isDiagnosticIdKey,
    isDiagnosticPathKey,
    shortenDiagnosticId,
} from './diagnosticFormatting';

const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 180;
const MAX_ARRAY_SAMPLE = 6;
const ARRAY_EDGE_SAMPLE = 2;
const JSON_PARSE_MIN_LENGTH = 80;

const LARGE_COLLECTION_KEYS = new Set([
    'assetIds',
    'mediaIds',
    'personIds',
    'faceIds',
    'clusterIds',
]);

const VECTOR_KEYS = new Set([
    'embedding',
    'embeddings',
    'vector',
    'vectors',
    'face_embeddings',
]);

const LARGE_TEXT_KEYS = new Set([
    'caption',
    'description',
    'summary',
    'text',
    'message',
    'reason',
]);

type SummaryContext = {
    depth: number;
    key?: string;
};

type EventLogEnvelope = {
    id: string;
    status: string;
    data: unknown;
    error: unknown;
};

type EventDisplayTone = 'neutral' | 'warning' | 'error';

type EventConsoleLevel = 'log' | 'warn' | 'error';

type FormattedEventDisplay = {
    text: string;
    tone: EventDisplayTone;
};

type FormattedConsoleEvent = {
    text: string;
    level: EventConsoleLevel;
};

const NOT_SCALAR = Symbol('not_scalar');

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) {return false;}
    if (typeof value === 'string') {return value.trim().length > 0;}
    return true;
}

function summarizeErrorValue(value: Error) {
    return {
        name: value.name,
        message: truncateString(value.message),
        stack: value.stack ? truncateString(value.stack, MAX_STRING_LENGTH * 2) : undefined,
    };
}

function summarizeScalarValue(value: unknown): unknown | typeof NOT_SCALAR {
    switch (typeof value) {
        case 'string':
            return truncateString(value);
        case 'number':
        case 'boolean':
            return value;
        case 'bigint':
        case 'symbol':
        case 'undefined':
        case 'object':
        case 'function':
            return NOT_SCALAR;
        default:
            return NOT_SCALAR;
    }
}

function truncateString(value: string, maxLength: number = MAX_STRING_LENGTH): string {
    if (value.length <= maxLength) {return value;}
    const remaining = value.length - maxLength;
    return `${value.slice(0, maxLength)}... [truncated ${remaining} chars]`;
}

function isNumericArray(value: unknown[]): boolean {
    return value.every((item) => typeof item === 'number');
}

function isEmbeddingMatrix(value: unknown[]): boolean {
    return value.every((item) => item === null || (Array.isArray(item) && isNumericArray(item)));
}

function summarizeVectorLike(value: unknown): unknown {
    if (!Array.isArray(value)) {return value;}

    if (isNumericArray(value)) {
        return {
            summary: 'numeric_vector',
            length: value.length,
        };
    }

    if (isEmbeddingMatrix(value)) {
        const firstRow = value.find((item) => Array.isArray(item)) as unknown[] | undefined;
        return {
            summary: 'embedding_matrix',
            rows: value.length,
            columns: firstRow?.length ?? 0,
        };
    }

    return {
        summary: 'vector_collection',
        count: value.length,
    };
}

function getCollapsedArrayMarker(omittedCount: number): string {
    return `... ${omittedCount} omitted ...`;
}

function summarizeLargeCollection(value: unknown[], context: SummaryContext): unknown {
    const head = value
        .slice(0, ARRAY_EDGE_SAMPLE)
        .map((item) => summarizeForEventLog(item, { ...context, depth: context.depth + 1 }));
    const tail = value
        .slice(-ARRAY_EDGE_SAMPLE)
        .map((item) => summarizeForEventLog(item, { ...context, depth: context.depth + 1 }));
    const omittedCount = value.length - (ARRAY_EDGE_SAMPLE * 2);

    return [
        ...head,
        getCollapsedArrayMarker(omittedCount),
        ...tail,
    ];
}

function summarizeArray(value: unknown[], context: SummaryContext): unknown {
    if (value.length <= MAX_ARRAY_SAMPLE) {
        return value.map((item) => summarizeForEventLog(item, { ...context, depth: context.depth + 1 }));
    }

    if (context.key && (LARGE_COLLECTION_KEYS.has(context.key) || context.key === 'ids' || context.key.endsWith('Ids') || context.key.endsWith('_ids'))) {
        return summarizeLargeCollection(value, context);
    }

    return summarizeLargeCollection(value, context);
}

function summarizeObject(value: Record<string, unknown>, context: SummaryContext): unknown {
    if (context.depth >= MAX_DEPTH) {
        return {
            summary: 'object',
            keys: Object.keys(value),
        };
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string' && isDiagnosticIdKey(key)) {
            result[key] = shortenDiagnosticId(entry);
            continue;
        }

        if (typeof entry === 'string' && isDiagnosticPathKey(key)) {
            result[key] = getDiagnosticFilename(entry);
            continue;
        }

        if (VECTOR_KEYS.has(key)) {
            result[key] = summarizeVectorLike(entry);
            continue;
        }

        if (LARGE_TEXT_KEYS.has(key) && typeof entry === 'string') {
            result[key] = truncateString(entry);
            continue;
        }

        result[key] = summarizeForEventLog(entry, { depth: context.depth + 1, key });
    }
    return result;
}

function trySummarizeJsonString(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length < JSON_PARSE_MIN_LENGTH) {return null;}
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {return null;}

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return JSON.stringify(summarizeForEventLog(parsed));
    } catch {
        return null;
    }
}

function tryParseJsonValue(value: string): unknown | null {
    const trimmed = value.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {return null;}

    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return null;
    }
}

function toEventEnvelope(value: unknown): EventLogEnvelope | null {
    if (!isRecord(value)) {return null;}
    if (typeof value.id !== 'string' || typeof value.status !== 'string') {return null;}

    return {
        id: value.id,
        status: value.status,
        data: value.data ?? null,
        error: value.error ?? null,
    };
}

function getEventRecord(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value) || typeof value.type !== 'string') {return null;}
    return value;
}

function formatCompactValue(value: unknown): string {
    const summarized = summarizeForEventLog(value);
    if (typeof summarized === 'string') {return JSON.stringify(summarized);}
    if (typeof summarized === 'number' || typeof summarized === 'boolean') {return String(summarized);}
    if (summarized === null || summarized === undefined) {return String(summarized);}
    return JSON.stringify(summarizeForEventLog(value));
}

function getEventTone(event: Record<string, unknown>, envelope: EventLogEnvelope | null): EventDisplayTone {
    const severity = event.severity;
    if (severity === 'fatal' || severity === 'error') {return 'error';}
    if (severity === 'warning') {return 'warning';}
    if (typeof event.type === 'string' && event.type.endsWith('Error')) {return 'error';}
    if (isNonEmptyValue(event.error) || isNonEmptyValue(envelope?.error)) {return 'error';}
    return 'neutral';
}

function getOrderedEventEntries(event: Record<string, unknown>, envelope: EventLogEnvelope | null): Array<[string, unknown]> {
    const entries = Object.entries(event).filter(([key]) => key !== 'type');
    if (isNonEmptyValue(envelope?.error)) {
        entries.push(['error', envelope?.error]);
    }
    return entries;
}

function buildAssetUpdatedEventDisplay(event: Record<string, unknown>): FormattedEventDisplay | null {
    const asset = isRecord(event.asset) ? event.asset : null;
    const assetId = typeof event.assetId === 'string'
        ? shortenDiagnosticId(event.assetId)
        : formatAssetDiagnosticLabel(asset);

    return {
        text: `AssetUpdated: refreshed asset ${assetId}`,
        tone: getEventTone(event, null),
    };
}

const EVENT_DISPLAY_BUILDERS: Record<string, (event: Record<string, unknown>) => FormattedEventDisplay | null> = {
    AssetUpdated: buildAssetUpdatedEventDisplay,
};

function buildFormattedEventDisplay(event: Record<string, unknown>, envelope: EventLogEnvelope | null): FormattedEventDisplay {
    const customDisplay = EVENT_DISPLAY_BUILDERS[String(event.type)]?.(event);
    if (customDisplay) {
        return customDisplay;
    }

    const detail = getOrderedEventEntries(event, envelope)
        .filter(([, value]) => isNonEmptyValue(value))
        .map(([key, value]) => `${key}=${formatCompactValue(value)}`)
        .join('; ');

    return {
        text: detail ? `${String(event.type)}: ${detail}` : String(event.type),
        tone: getEventTone(event, envelope),
    };
}

export function summarizeForEventLog(value: unknown, context: SummaryContext = { depth: 0 }): unknown {
    if (value === null || value === undefined) {return value;}

    if (value instanceof Error) {
        return summarizeErrorValue(value);
    }

    const scalarValue = summarizeScalarValue(value);
    if (scalarValue !== NOT_SCALAR) {
        return scalarValue;
    }

    if (Array.isArray(value)) {
        return summarizeArray(value, context);
    }

    if (isRecord(value)) {
        return summarizeObject(value, context);
    }

    return String(value);
}

export function formatForEventLog(value: unknown): string {
    const formattedEvent = formatEventForDisplay(value);
    if (formattedEvent) {return formattedEvent.text;}

    if (typeof value === 'string') {
        return trySummarizeJsonString(value) ?? truncateString(value, MAX_STRING_LENGTH * 2);
    }

    try {
        return JSON.stringify(summarizeForEventLog(value));
    } catch {
        return String(value);
    }
}

export function buildEventLogEnvelope(envelope: EventLogEnvelope): EventLogEnvelope {
    return {
        id: envelope.id,
        status: envelope.status,
        data: summarizeForEventLog(envelope.data),
        error: summarizeForEventLog(envelope.error),
    };
}

export function formatEventForDisplay(value: unknown): FormattedEventDisplay | null {
    const parsedValue = typeof value === 'string' ? tryParseJsonValue(value) : value;
    const envelope = toEventEnvelope(parsedValue);
    const event = getEventRecord(envelope?.data ?? parsedValue);
    if (!event) {return null;}
    return buildFormattedEventDisplay(event, envelope);
}

export function getEventToneForDisplay(value: unknown): EventDisplayTone {
    return formatEventForDisplay(value)?.tone ?? 'neutral';
}

export function formatEventEnvelopeForConsole(envelope: EventLogEnvelope): FormattedConsoleEvent {
    const formattedEvent = formatEventForDisplay(envelope);
    if (formattedEvent) {
        return {
            text: formattedEvent.text,
            level: (function () {
                if (formattedEvent.tone === 'error') {return 'error';}
                if (formattedEvent.tone === 'warning') {return 'warn';}
                return 'log';
            }()),
        };
    }

    return {
        text: JSON.stringify(buildEventLogEnvelope(envelope)),
        level: envelope.status === 'error' || isNonEmptyValue(envelope.error) ? 'error' : 'log',
    };
}
