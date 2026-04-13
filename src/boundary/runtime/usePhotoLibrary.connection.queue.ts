type ScheduleFlush = (flush: () => void) => void;

export interface QueuedMessageProcessor {
    enqueue: (message: string) => void;
    flush: () => void;
    cancel: () => void;
}

interface CreateQueuedMessageProcessorOptions {
    processMessage: (message: string) => void;
    batchSize?: number;
    scheduleFlush?: ScheduleFlush;
}

const DEFAULT_BATCH_SIZE = 25;

function scheduleFlushWithFallback(flush: () => void) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => flush());
        return;
    }

    setTimeout(flush, 0);
}

export function createQueuedMessageProcessor(options: CreateQueuedMessageProcessorOptions): QueuedMessageProcessor {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const scheduleFlush = options.scheduleFlush ?? scheduleFlushWithFallback;
    const queue: string[] = [];
    let scheduled = false;
    let cancelled = false;

    const flush = () => {
        scheduled = false;
        if (cancelled) {
            queue.length = 0;
            return;
        }

        const batch = queue.splice(0, batchSize);
        for (const message of batch) {
            options.processMessage(message);
        }

        if (queue.length > 0) {
            schedule();
        }
    };

    const schedule = () => {
        if (scheduled || cancelled || queue.length === 0) {
            return;
        }

        scheduled = true;
        scheduleFlush(flush);
    };

    return {
        enqueue(message: string) {
            if (cancelled) {
                return;
            }

            queue.push(message);
            schedule();
        },
        flush,
        cancel() {
            cancelled = true;
            scheduled = false;
            queue.length = 0;
        },
    };
}
