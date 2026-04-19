import { useEffect } from 'react';
import type { Asset } from '@contracts/core';

export function shouldClearMissingSelection(params: {
    assets: Asset[];
    selectedAssetId: string | null;
    isRefreshingLibrary: boolean;
}) {
    const { assets, selectedAssetId, isRefreshingLibrary } = params;
    if (!selectedAssetId || assets.length === 0 || isRefreshingLibrary) {
        return false;
    }

    return !assets.some((asset) => asset.id === selectedAssetId);
}

export function useSelectionRecovery(params: {
    assets: Asset[];
    selectedAssetId: string | null;
    isRefreshingLibrary: boolean;
    setSelectedAssetId: (assetId: string | null) => void;
    setStatusMessage: (message: string | null) => void;
}) {
    const {
        assets,
        selectedAssetId,
        isRefreshingLibrary,
        setSelectedAssetId,
        setStatusMessage,
    } = params;

    useEffect(() => {
        if (!shouldClearMissingSelection({ assets, selectedAssetId, isRefreshingLibrary })) {
            return;
        }

        setSelectedAssetId(null);
        const showTimer = window.setTimeout(() => setStatusMessage('Previously selected photo is no longer available.'), 0);
        const clearTimer = window.setTimeout(() => setStatusMessage(null), 5000);

        return () => {
            window.clearTimeout(showTimer);
            window.clearTimeout(clearTimer);
        };
    }, [assets, isRefreshingLibrary, selectedAssetId, setSelectedAssetId, setStatusMessage]);
}
