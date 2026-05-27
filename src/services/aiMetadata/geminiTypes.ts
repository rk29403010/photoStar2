import type { PhotoMetadataBlock } from '../photoMetadata/types';

export const MODEL_REFINE = 'gemini-3.1-pro-preview';
export const MODEL_SCOUT = 'gemini-2.5-flash';
export const MODEL_PRO = MODEL_REFINE;
export const MODEL_FLASH = MODEL_SCOUT;

export type GeminiResponse = PhotoMetadataBlock & {
    tag_proposals?: string[];
    _analysis_tier?: 'pro' | 'flash';
    _pending_pro?: boolean;
};

export type ParsedAiMetadataRow = {
    id: string;
    original_path: string;
    width: number | null;
    height: number | null;
    sensitivity_status: string | null;
    sensitivity_score: number | null;
}

export type StoredAiMetadataResult = {
    provider: string;
    modelVersion: string;
    data: Record<string, unknown>;
}

function convertRawBoundingBox(box: unknown): { x: number; y: number; width: number; height: number } | unknown {
    if (Array.isArray(box) && box.length === 4 && box.every(val => typeof val === 'number')) {
        const [ymin, xmin, ymax, xmax] = box;
        return {
            x: xmin,
            y: ymin,
            width: Math.max(0, xmax - xmin),
            height: Math.max(0, ymax - ymin),
        };
    }
    return box;
}

type RawEntry = {
    bounding_box?: unknown;
    [key: string]: unknown;
}

type RawResponse = {
    subjects?: RawEntry[];
    regions_of_interest?: RawEntry[];
    [key: string]: unknown;
}

function convertBoundingBoxes(entry: RawEntry): RawEntry {
    if (entry && typeof entry === 'object' && entry.bounding_box) {
        return {
            ...entry,
            bounding_box: convertRawBoundingBox(entry.bounding_box),
        };
    }
    return entry;
}

export function parseGeminiResponse(text: string): GeminiResponse {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        const raw = JSON.parse(cleaned) as RawResponse;
        if (!raw || typeof raw !== 'object') {
            return raw as unknown as GeminiResponse;
        }
        if (Array.isArray(raw.subjects)) {
            raw.subjects = raw.subjects.map(convertBoundingBoxes);
        }
        if (Array.isArray(raw.regions_of_interest)) {
            raw.regions_of_interest = raw.regions_of_interest.map(convertBoundingBoxes);
        }
        return raw as unknown as GeminiResponse;
    } catch (error) {
        throw new Error(`Failed to parse AI JSON response: ${(error as Error).message}`);
    }
}

const MODEL_UNAVAILABLE_PATTERNS = [
    'is not found for api version',
    'not supported for generatecontent',
] as const;

const AUTH_PERMISSION_PATTERNS = [
    'api key not valid',
    'permission denied',
    'insufficient permission',
    '401',
    '403',
] as const;

const NETWORK_FETCH_PATTERNS = [
    'fetch failed',
    'econnreset',
    'enotfound',
    'econnrefused',
    'etimedout',
    'network error',
    'socket hang up',
] as const;

function includesAnyPattern(value: string, patterns: readonly string[]): boolean {
    return patterns.some((pattern) => value.includes(pattern));
}

function isModelUnavailableError(lowerMessage: string): boolean {
    return (lowerMessage.includes('404') && lowerMessage.includes('models/'))
        || includesAnyPattern(lowerMessage, MODEL_UNAVAILABLE_PATTERNS);
}

function isAuthOrPermissionError(lowerMessage: string): boolean {
    return includesAnyPattern(lowerMessage, AUTH_PERMISSION_PATTERNS);
}

function isNetworkFetchError(lowerMessage: string): boolean {
    return includesAnyPattern(lowerMessage, NETWORK_FETCH_PATTERNS);
}

export function getUnrecoverableAiReason(error: Error): string | null {
    const message = error.message || '';
    const lowerMessage = message.toLowerCase();

    if (message === 'MISSING_API_KEY') {
        return 'Live AI metadata requires a configured Gemini API key. Add one in Settings before running live ingest.';
    }

    if (message === 'INVALID_API_KEY_FORMAT') {
        return 'Configured Gemini API key is invalid. Update it in Settings before running live ingest.';
    }

    if (isModelUnavailableError(lowerMessage)) {
        return `Configured model is unavailable or retired: ${message}`;
    }

    if (isAuthOrPermissionError(lowerMessage)) {
        return `AI API auth/permission error: ${message}`;
    }

    if (isNetworkFetchError(lowerMessage)) {
        return 'Unable to reach Gemini right now. Check your internet connection and try again.';
    }

    return null;
}
