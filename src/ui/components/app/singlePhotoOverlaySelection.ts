import type { Asset } from '@contracts/core';
import { mergeSinglePhotoAssets, resolveSinglePhotoAssetIndex } from '../single-photo/singlePhotoAssetModel.ts';

export function resolveSinglePhotoOverlaySelection(params: {
    assets: Asset[];
    selectedAssetId: string | null;
    fallbackSelectedAsset: Asset | null;
}) {
    const { assets, selectedAssetId, fallbackSelectedAsset } = params;
    if (!selectedAssetId) {
        return { overlayAssets: assets, selectedAsset: null, selectedIndex: -1 };
    }

    const selectedIndex = assets.findIndex((asset) => asset.id === selectedAssetId);
    if (selectedIndex >= 0) {
        return {
            overlayAssets: assets,
            selectedAsset: assets[selectedIndex],
            selectedIndex,
        };
    }

    if (fallbackSelectedAsset?.id !== selectedAssetId) {
        return { overlayAssets: assets, selectedAsset: null, selectedIndex: -1 };
    }

    const overlayAssets = mergeSinglePhotoAssets(assets, [fallbackSelectedAsset]);
    return {
        overlayAssets,
        selectedAsset: fallbackSelectedAsset,
        selectedIndex: Math.max(resolveSinglePhotoAssetIndex(overlayAssets, selectedAssetId), 0),
    };
}
