import { useEffect, useMemo } from 'react';
import { LatestPreviewQueue } from './photoEditPreviewQueue';

type PreviewHookParams<T> = {
    enabled: boolean;
    input: T;
    onError: (error: unknown, revision: number) => void;
    onQueued: (revision: number) => void;
    onReady: (url: string, revision: number) => void;
    request: (input: T) => Promise<string>;
    debounceMs?: number;
};

export function usePhotoEditPreview<T>(params: PreviewHookParams<T>): void {
    const queue = useMemo(() => new LatestPreviewQueue<T>({
        debounceMs: params.debounceMs,
        request: params.request,
        callbacks: {
            onError: params.onError,
            onQueued: params.onQueued,
            onReady: params.onReady,
        },
    }), [params.debounceMs, params.onError, params.onQueued, params.onReady, params.request]);

    useEffect(() => () => queue.dispose(), [queue]);
    useEffect(() => {
        if (params.enabled) {queue.enqueue(params.input);}
    }, [params.enabled, params.input, queue]);
}
