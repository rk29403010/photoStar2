import { useEffect } from 'react';

export function useCopyReset(copiedTarget: string | null, setCopiedTarget: (value: string | null) => void) {
    useEffect(() => {
        if (!copiedTarget) {
            return;
        }
        const timer = globalThis.setTimeout(() => setCopiedTarget(null), 1500);
        return () => globalThis.clearTimeout(timer);
    }, [copiedTarget, setCopiedTarget]);
}
