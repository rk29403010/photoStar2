const RPM_WAIT_MS = 62_000;
export const MAX_WAIT_BEFORE_FALLBACK_MS = 90_000;

type ModelQuotaState = {
    dailyExceededAt: string | null;
    rateLimitedUntilMs: number | null;
    recentRequests: number[];
}

const states: Record<string, ModelQuotaState> = {};

function getState(model: string): ModelQuotaState {
    if (!states[model]) {
        states[model] = { dailyExceededAt: null, rateLimitedUntilMs: null, recentRequests: [] };
    }
    return states[model];
}

export function recordRequest(model: string): void {
    const state = getState(model);
    const now = Date.now();
    state.recentRequests = state.recentRequests.filter((timestamp) => now - timestamp < 60_000);
    state.recentRequests.push(now);
}

export function isDailyQuotaExceeded(model: string): boolean {
    const state = getState(model);
    if (!state.dailyExceededAt) {
        return false;
    }
    const exceededDay = new Date(state.dailyExceededAt).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (exceededDay !== today) {
        state.dailyExceededAt = null;
        return false;
    }
    return true;
}

export function isRateLimited(model: string): boolean {
    const state = getState(model);
    if (!state.rateLimitedUntilMs) {
        return false;
    }
    if (Date.now() >= state.rateLimitedUntilMs) {
        state.rateLimitedUntilMs = null;
        return false;
    }
    return true;
}

export function msUntilRateLimitClears(model: string): number {
    const state = getState(model);
    if (!state.rateLimitedUntilMs) {
        return 0;
    }
    return Math.max(0, state.rateLimitedUntilMs - Date.now());
}

export type QuotaErrorType = 'rate_limit' | 'daily_quota' | 'other';

function normalizeErrorMessage(error: Error): string {
    return (error.message || '').toLowerCase();
}

function isQuotaLimitMessage(message: string): boolean {
    return message.includes('429')
        || message.includes('rate limit')
        || message.includes('resource_exhausted')
        || message.includes('quota exceeded');
}

function isDailyQuotaMessage(message: string): boolean {
    return message.includes('daily')
        || message.includes('per_day')
        || message.includes('per day')
        || message.includes('day limit');
}

function getRetryWaitMs(message: string): number {
    const retryMatch = /retry[_ -]?after[: ]+(\d+)/i.exec(message) || /(\d+)\s*seconds/i.exec(message);
    if (!retryMatch) {
        return RPM_WAIT_MS;
    }
    return (Number.parseInt(retryMatch[1], 10) + 5) * 1000;
}

export function classifyAndRecordError(model: string, error: Error): QuotaErrorType {
    const normalizedMessage = normalizeErrorMessage(error);
    if (!isQuotaLimitMessage(normalizedMessage)) {
        return 'other';
    }

    if (isDailyQuotaMessage(normalizedMessage)) {
        getState(model).dailyExceededAt = new Date().toISOString();
        return 'daily_quota';
    }

    getState(model).rateLimitedUntilMs = Date.now() + getRetryWaitMs(normalizedMessage);
    return 'rate_limit';
}

export async function sleepWithLog(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
