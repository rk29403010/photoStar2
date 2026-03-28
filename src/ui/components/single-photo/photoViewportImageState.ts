import type { Asset } from '@contracts/core';

type NullableAsset = Asset | null;

export function resolveViewportStageAsset(params: {
    committedAsset: NullableAsset;
    requestedAsset: Asset;
    isRequestedImageReady: boolean;
}): Asset {
    const { committedAsset, requestedAsset, isRequestedImageReady } = params;
    if (!committedAsset) {
        return requestedAsset;
    }

    if (committedAsset.id !== requestedAsset.id && !isRequestedImageReady) {
        return committedAsset;
    }

    return requestedAsset;
}

export function shouldShowViewportFaceOverlays(params: {
    showFaces: boolean;
    alwaysShowForPanel: boolean;
    committedAssetId: string | null;
    requestedAssetId: string | null;
    isRequestedImageReady: boolean;
}): boolean {
    const { showFaces, alwaysShowForPanel, committedAssetId, requestedAssetId, isRequestedImageReady } = params;
    if (!showFaces && !alwaysShowForPanel) {
        return false;
    }

    if (!isRequestedImageReady || !committedAssetId || !requestedAssetId) {
        return false;
    }

    return committedAssetId === requestedAssetId;
}

export function resolveViewportImageSrc(asset: Asset): string | null {
    return asset.original_path || asset.preview_path || null;
}
