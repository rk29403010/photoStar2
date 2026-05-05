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
    showTransientBanner: (params: { message: string }) => void;
}) {
    const {
        assets,
        selectedAssetId,
        isRefreshingLibrary,
        setSelectedAssetId,
        showTransientBanner,
    } = params;

    useEffect(() => {
        if (!shouldClearMissingSelection({ assets, selectedAssetId, isRefreshingLibrary })) {
            return;
        }

        setSelectedAssetId(null);
        const showTimer = globalThis.setTimeout(() => showTransientBanner({ message: 'Previously selected photo is no longer available.' }), 0);

        return () => {
            globalThis.clearTimeout(showTimer);
        };
    }, [assets, isRefreshingLibrary, selectedAssetId, setSelectedAssetId, showTransientBanner]);
}
