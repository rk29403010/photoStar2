import { useEffect, useRef } from 'react';

export function useSinglePhotoAssetLifecycle(params: {
    assetId: string | undefined;
    shouldSyncAssetFocus?: boolean;
    onAssetFocusChange?: (assetId: string) => void;
    onPrioritize: (mediaId: string) => void;
}) {
    const lastPrioritizedAssetIdRef = useRef<string | null>(null);
    const { assetId, shouldSyncAssetFocus = true, onAssetFocusChange, onPrioritize } = params;

    useEffect(() => {
        if (!assetId) {
            return;
        }

        if (shouldSyncAssetFocus) {
            onAssetFocusChange?.(assetId);
        }
        if (lastPrioritizedAssetIdRef.current === assetId) {
            return;
        }

        lastPrioritizedAssetIdRef.current = assetId;
        onPrioritize(assetId);
    }, [assetId, onAssetFocusChange, onPrioritize, shouldSyncAssetFocus]);
}
