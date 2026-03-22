import { useEffect } from 'react';

export function useCopyReset(copiedTarget: string | null, setCopiedTarget: (value: string | null) => void) {
    useEffect(() => {
        if (!copiedTarget) {
            return;
        }
        const timer = window.setTimeout(() => setCopiedTarget(null), 1500);
        return () => window.clearTimeout(timer);
    }, [copiedTarget, setCopiedTarget]);
}
