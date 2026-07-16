export type PreviewQueueCallbacks = {
    onError: (error: unknown, revision: number) => void;
    onQueued: (revision: number) => void;
    onReady: (url: string, revision: number) => void;
};

type PreviewJob<T> = {
    input: T;
    revision: number;
};

type PreviewQueueOptions<T> = {
    callbacks: PreviewQueueCallbacks;
    minimumIntervalMs?: number;
    now?: () => number;
    request: (input: T) => Promise<string>;
    wait?: (milliseconds: number) => Promise<void>;
};

const defaultWait = (milliseconds: number) => new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
});

export class LatestPreviewQueue<T> {
    private readonly callbacks: PreviewQueueCallbacks;
    private disposed = false;
    private lastStartedAt = Number.NEGATIVE_INFINITY;
    private latestRevision = 0;
    private readonly minimumIntervalMs: number;
    private readonly now: () => number;
    private pending: PreviewJob<T> | null = null;
    private readonly request: (input: T) => Promise<string>;
    private running = false;
    private readonly wait: (milliseconds: number) => Promise<void>;

    constructor(options: PreviewQueueOptions<T>) {
        this.callbacks = options.callbacks;
        this.minimumIntervalMs = options.minimumIntervalMs ?? 80;
        this.now = options.now ?? Date.now;
        this.request = options.request;
        this.wait = options.wait ?? defaultWait;
    }

    enqueue(input: T): number {
        this.latestRevision += 1;
        const revision = this.latestRevision;
        this.pending = { input, revision };
        this.callbacks.onQueued(revision);
        if (!this.running) {void this.drain();}
        return revision;
    }

    dispose(): void {
        this.disposed = true;
        this.pending = null;
    }

    private isCurrent(job: PreviewJob<T>): boolean {
        return !this.disposed && job.revision === this.latestRevision;
    }

    private startDelay(): number {
        return Math.max(0, this.minimumIntervalMs - (this.now() - this.lastStartedAt));
    }

    private async runJob(job: PreviewJob<T>): Promise<void> {
        const delay = this.startDelay();
        if (delay > 0) {await this.wait(delay);}
        if (this.disposed) {return;}
        this.lastStartedAt = this.now();
        try {
            const url = await this.request(job.input);
            if (this.isCurrent(job)) {this.callbacks.onReady(url, job.revision);}
        } catch (error) {
            if (this.isCurrent(job)) {this.callbacks.onError(error, job.revision);}
        }
    }

    private async drain(): Promise<void> {
        this.running = true;
        while (this.pending && !this.disposed) {
            const job = this.pending;
            this.pending = null;
            await this.runJob(job);
        }
        this.running = false;
    }
}
