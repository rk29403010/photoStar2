import { useEffect, useRef } from 'react';

export function shouldSyncSinglePhotoAssetFocus(params: {
    assetId: string | undefined;
    lastSyncedAssetId: string | null;
    shouldSyncAssetFocus: boolean;
}) {
    const { assetId, lastSyncedAssetId, shouldSyncAssetFocus } = params;
    return Boolean(assetId) && shouldSyncAssetFocus && assetId !== lastSyncedAssetId;
}

export function useSinglePhotoAssetLifecycle(params: {
    assetId: string | undefined;
    shouldSyncAssetFocus?: boolean;
    onAssetFocusChange?: (assetId: string) => void;
    onPrioritize: (mediaId: string) => void;
}) {
    const lastSyncedAssetIdRef = useRef<string | null>(null);
    const lastPrioritizedAssetIdRef = useRef<string | null>(null);
    const { assetId, shouldSyncAssetFocus = true, onAssetFocusChange, onPrioritize } = params;

    useEffect(() => {
        if (!assetId) {
            lastSyncedAssetIdRef.current = null;
            return;
        }

        if (shouldSyncSinglePhotoAssetFocus({
            assetId,
            lastSyncedAssetId: lastSyncedAssetIdRef.current,
            shouldSyncAssetFocus,
        })) {
            lastSyncedAssetIdRef.current = assetId;
            onAssetFocusChange?.(assetId);
        }
        if (lastPrioritizedAssetIdRef.current === assetId) {
            return;
        }

        lastPrioritizedAssetIdRef.current = assetId;
        onPrioritize(assetId);
    }, [assetId, onAssetFocusChange, onPrioritize, shouldSyncAssetFocus]);
}
