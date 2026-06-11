function getQuotaWarningCount(event: Record<string, unknown>): number {
    const pending = Number(event.pendingProCount || 0);
    if (pending > 0) {
        return pending;
    }
    return Array.isArray(event.assetIds) ? event.assetIds.length : 0;
}

function buildQuotaWarningMessage(event: Record<string, unknown>): string {
    const model = typeof event.model === 'string' ? event.model : 'model';
    const fallback = typeof event.fallbackModel === 'string' ? event.fallbackModel : '';
    const count = getQuotaWarningCount(event);
    const isFallbackWarning = fallback.length > 0 && count > 0;

    if ((typeof event.reason === 'string' ? event.reason : '') === 'daily_quota') {
        if (isFallbackWarning) {
            return `⚠️ Daily quota exceeded on ${model}. ${count} photo(s) were analysed with ${fallback} and queued for ${model} follow-up tomorrow.`;
        }
        return `⚠️ Daily quota exceeded on ${model}. ${count} photo(s) remain queued until quota resets.`;
    }

    if (isFallbackWarning) {
        return `⚠️ Rate limit hit on ${model}. Fell back to ${fallback}. ${count} photo(s) queued for ${model} follow-up.`;
    }

    return `⚠️ Rate limit hit on ${model}. ${count} photo(s) remain queued until the limit clears.`;
}

export function applyQuotaNotifications(
    event: Record<string, unknown>,
    addNotification: (
        type: 'warning' | 'info' | 'success' | 'error',
        title: string,
        options?: { message?: string }
    ) => void
) {
    if (event.type === 'AiMetadataConfigurationError') {
        addNotification('warning', 'AI metadata configuration issue', {
            message: typeof event.message === 'string' ? event.message : 'Live AI metadata is not configured.',
        });
    }

    if (event.type === 'QuotaWarning') {
        addNotification('warning', 'AI quota warning', { message: buildQuotaWarningMessage(event) });
    }

    if (event.type === 'ProAnalysisPending') {
        const count = Array.isArray(event.assetIds) ? event.assetIds.length : 0;
        addNotification('info', 'Pro analysis queued', {
            message: `${count} photo(s) queued for enhanced analysis with ${typeof event.proModel === 'string' ? event.proModel : 'model'} when quota resets.`,
        });
    }
}
