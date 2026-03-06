/**
 * quota_manager.ts
 *
 * Module-level singleton that tracks Gemini API rate limits per model.
 * Shared across batch and single-asset calls within the same process.
 *
 * Free-tier limits (approximate, as of 2026-03):
 *   gemini-3.1-pro-preview : 2 RPM,  ~50  RPD
 *   gemini-3-flash-preview  : 10 RPM, ~500 RPD
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
    if (!s.dailyExceededAt) return false;
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
    if (!s.rateLimitedUntilMs) return false;
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
    if (!s.rateLimitedUntilMs) return 0;
    return Math.max(0, s.rateLimitedUntilMs - Date.now());
}

/**
 * Parse an API error and classify it.
 * Returns: 'rate_limit' | 'daily_quota' | 'other'
 * Also updates internal state accordingly.
 */
export type QuotaErrorType = 'rate_limit' | 'daily_quota' | 'other';

export function classifyAndRecordError(model: string, err: Error): QuotaErrorType {
    const msg = err.message || '';
    const isRateLimit =
        msg.includes('429') ||
        msg.toLowerCase().includes('rate limit') ||
        msg.toLowerCase().includes('resource_exhausted') ||
        msg.toLowerCase().includes('quota exceeded');

    if (!isRateLimit) return 'other';

    // Distinguish daily quota from per-minute rate limit.
    // Gemini daily quota messages contain "daily" or "per_day"
    const isDaily =
        msg.toLowerCase().includes('daily') ||
        msg.toLowerCase().includes('per_day') ||
        msg.toLowerCase().includes('per day') ||
        msg.toLowerCase().includes('day limit');

    if (isDaily) {
        console.warn(`[QuotaManager] Daily quota exceeded for ${model}`);
        getState(model).dailyExceededAt = new Date().toISOString();
        return 'daily_quota';
    }

    // Per-minute rate limit — try to extract retry-after from message
    let waitMs = RPM_WAIT_MS;
    const retryMatch = msg.match(/retry[_ -]?after[: ]+(\d+)/i) ||
        msg.match(/(\d+)\s*seconds/i);
    if (retryMatch) {
        waitMs = (parseInt(retryMatch[1], 10) + 5) * 1000; // +5s buffer
    }

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
