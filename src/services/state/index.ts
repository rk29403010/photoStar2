export const SystemState = {
    isPaused: false
};

/**
 * Pauses execution if SystemState.isPaused is true.
 * Checks every 500ms and respects AbortSignals to break out cleanly.
 */
export async function waitIfPaused(signal?: AbortSignal): Promise<void> {
    while (SystemState.isPaused) {
        if (signal?.aborted) {
            throw new Error('Aborted while paused');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Yield to Node's event loop even if not paused.
    // This allows incoming IPC/WebSocket commands (like 'stop_job') 
    // to be high-priority and execute immediately between heavy DB iterations.
    await new Promise(resolve => setImmediate(resolve));
}
