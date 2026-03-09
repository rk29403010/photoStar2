/**
 * quota_manager.ts
 *
 * Module-level singleton that tracks Gemini API rate limits per model.
 * Shared across batch and single-asset calls within the same process.
 *
 * Free-tier limits (approximate, as of 2026-03):
 *   gemini-3.1-pro-preview : 2 RPM,  ~50  RPD
 *   gemini-3-flash-preview : 10 RPM, ~500 RPD
 *   gemini-2.0-flash        : 15 RPM, 1500 RPD
 */

// How long to wait before retrying when we hit a per-minute limit (ms)
const RPM_WAIT_MS = 62_000; // 62 seconds — a full RPM window plus buffer

// If the API says retry-after > this threshold, don't wait: fall back instead
const MAX_WAIT_BEFORE_FALLBACK_MS = 90_000;

interface ModelQuotaState {
    /** ISO string of when the daily quota was marked exceeded (reset UTC midnight) */
    dailyExceededAt: string | null;
    /** Timestamp (ms) when a rate-limit wait started — null if not rate-limited */
    rateLimitedUntilMs: number | null;
    /** Request timestamps in the current rolling 60s window */
    recentRequests: number[];
}

const states: Record<string, ModelQuotaState> = {};

function getState(model: string): ModelQuotaState {
    if (!states[model]) {
        states[model] = { dailyExceededAt: null, rateLimitedUntilMs: null, recentRequests: [] };
    }
    return states[model];
}

// ── Public helpers ─────────────────────────────────────────────────────────────

/** Call before every API request to record it in the rolling window */
export function recordRequest(model: string): void {
    const s = getState(model);
    const now = Date.now();
    s.recentRequests = s.recentRequests.filter(t => now - t < 60_000);
    s.recentRequests.push(now);
}

/** Is the daily quota marked as exceeded for this model? */
export function isDailyQuotaExceeded(model: string): boolean {
    const s = getState(model);
    if (!s.dailyExceededAt) {return false;}
    // Reset at UTC midnight
    const exceededDay = new Date(s.dailyExceededAt).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (exceededDay !== today) {
        s.dailyExceededAt = null; // new day, cleared
        return false;
    }
    return true;
}

/** Is the model currently in a per-minute rate-limit state? */
export function isRateLimited(model: string): boolean {
    const s = getState(model);
    if (!s.rateLimitedUntilMs) {return false;}
    if (Date.now() >= s.rateLimitedUntilMs) {
        s.rateLimitedUntilMs = null;
        console.log(`[QuotaManager] Rate limit cleared for ${model}`);
        return false;
    }
    return true;
}

/** How many ms until rate limit clears (0 if not limited) */
export function msUntilRateLimitClears(model: string): number {
    const s = getState(model);
    if (!s.rateLimitedUntilMs) {return 0;}
    return Math.max(0, s.rateLimitedUntilMs - Date.now());
}

/**
 * Parse an API error and classify it.
 * Returns: 'rate_limit' | 'daily_quota' | 'other'
 * Also updates internal state accordingly.
 */
export type QuotaErrorType = 'rate_limit' | 'daily_quota' | 'other';

function normalizeErrorMessage(err: Error): string {
    return (err.message || '').toLowerCase();
}

function isQuotaLimitMessage(message: string): boolean {
    return message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('resource_exhausted') ||
        message.includes('quota exceeded');
}

function isDailyQuotaMessage(message: string): boolean {
    return message.includes('daily') ||
        message.includes('per_day') ||
        message.includes('per day') ||
        message.includes('day limit');
}

function getRetryWaitMs(message: string): number {
    const retryMatch = new RegExp(/retry[_ -]?after[: ]+(\d+)/i).exec(message) ||
        new RegExp(/(\d+)\s*seconds/i).exec(message);

    if (!retryMatch) {
        return RPM_WAIT_MS;
    }

    return (Number.parseInt(retryMatch[1], 10) + 5) * 1000;
}

export function classifyAndRecordError(model: string, err: Error): QuotaErrorType {
    const normalizedMessage = normalizeErrorMessage(err);
    const isRateLimit = isQuotaLimitMessage(normalizedMessage);

    if (!isRateLimit) {return 'other';}

    if (isDailyQuotaMessage(normalizedMessage)) {
        console.warn(`[QuotaManager] Daily quota exceeded for ${model}`);
        getState(model).dailyExceededAt = new Date().toISOString();
        return 'daily_quota';
    }

    const waitMs = getRetryWaitMs(normalizedMessage);
    console.warn(`[QuotaManager] Rate limit hit for ${model}. Will clear in ${Math.ceil(waitMs / 1000)}s`);
    getState(model).rateLimitedUntilMs = Date.now() + waitMs;
    return 'rate_limit';
}

/** Sleep for ms milliseconds, logging progress every 10s */
export async function sleepWithLog(ms: number, label: string): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const remaining = Math.ceil((end - Date.now()) / 1000);
        console.log(`[QuotaManager] ${label}: waiting ${remaining}s...`);
        await new Promise(r => setTimeout(r, Math.min(10_000, end - Date.now())));
    }
}

export { RPM_WAIT_MS, MAX_WAIT_BEFORE_FALLBACK_MS };
