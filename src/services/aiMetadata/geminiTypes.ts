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

export function parseGeminiResponse(text: string): GeminiResponse {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as GeminiResponse;
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
