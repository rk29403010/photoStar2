const FAST_RECONNECT_INFO_THRESHOLD_MS = 10000;
const BACKEND_SERVICE_LABEL = 'backend service';

export interface RetryState {
    error: string | null;
    level: 'info' | 'warning';
    logMessage: string;
    status: string;
}

export function formatReconnectDelay(delayMs: number): string {
    return `${Math.max(1, Math.ceil(delayMs / 1000))}s`;
}

export function getRetryState(
    paramsRef: { current: { hasCompletedInitialSync: boolean } },
    delayMs: number,
    message: string,
    status: string,
): RetryState {
    const delayText = formatReconnectDelay(delayMs);

    if (!paramsRef.current.hasCompletedInitialSync) {
        return {
            level: 'info',
            status: `Waiting for ${BACKEND_SERVICE_LABEL} to become ready... Retrying in ${delayText}...`,
            error: null,
            logMessage: `${BACKEND_SERVICE_LABEL} not ready yet. Retrying in ${delayText}.`,
        };
    }

    if (delayMs < FAST_RECONNECT_INFO_THRESHOLD_MS) {
        return {
            level: 'info',
            status,
            error: null,
            logMessage: `${message} Reconnecting in ${delayText}.`,
        };
    }

    return {
        level: 'warning',
        status,
        error: `${message} Reconnecting in ${delayText}...`,
        logMessage: `${message} Reconnecting in ${delayText}.`,
    };
}
