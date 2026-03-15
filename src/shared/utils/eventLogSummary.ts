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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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

export function summarizeForEventLog(value: unknown, context: SummaryContext = { depth: 0 }): unknown {
    if (value === null || value === undefined) {return value;}

    if (value instanceof Error) {
        return {
            name: value.name,
            message: truncateString(value.message),
            stack: value.stack ? truncateString(value.stack, MAX_STRING_LENGTH * 2) : undefined,
        };
    }

    if (typeof value === 'string') {
        return truncateString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
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
