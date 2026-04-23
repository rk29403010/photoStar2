import type { Asset } from '@contracts/core';

type NullableAsset = Asset | null;

export type ViewportImageTransitionState = {
    activeAsset: NullableAsset;
    activeImageSrc: string | null;
    pendingAsset: NullableAsset;
    pendingImageSrc: string | null;
    isActiveImageReady: boolean;
};

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

export function shouldQueueViewportImageTransition(params: {
    activeAssetId: string | null;
    requestedAssetId: string;
    activeImageSrc: string | null;
    requestedImageSrc: string;
    pendingAssetId: string | null;
    pendingImageSrc: string | null;
}): boolean {
    const {
        activeAssetId,
        requestedAssetId,
        activeImageSrc,
        requestedImageSrc,
        pendingAssetId,
        pendingImageSrc,
    } = params;

    const isAlreadyActive = activeAssetId === requestedAssetId && activeImageSrc === requestedImageSrc;
    if (isAlreadyActive) {
        return false;
    }

    return !(pendingAssetId === requestedAssetId && pendingImageSrc === requestedImageSrc);
}

export function getViewportImageTransitionKey(params: {
    requestedAssetId: string;
    requestedImageSrc: string;
}): string {
    return `${params.requestedAssetId}::${params.requestedImageSrc}`;
}

export function shouldSuppressRepeatedViewportTransition(params: {
    lastRequestedTransitionKey: string | null;
    requestedAssetId: string;
    requestedImageSrc: string;
}): boolean {
    return params.lastRequestedTransitionKey === getViewportImageTransitionKey({
        requestedAssetId: params.requestedAssetId,
        requestedImageSrc: params.requestedImageSrc,
    });
}

export function isViewportImageTransitionAlreadyActive(params: {
    activeAssetId: string | null;
    requestedAssetId: string;
    activeImageSrc: string | null;
    requestedImageSrc: string;
}): boolean {
    return params.activeAssetId === params.requestedAssetId && params.activeImageSrc === params.requestedImageSrc;
}

export function isViewportImageTransitionAlreadyPending(params: {
    pendingAssetId: string | null;
    requestedAssetId: string;
    pendingImageSrc: string | null;
    requestedImageSrc: string;
}): boolean {
    return params.pendingAssetId === params.requestedAssetId && params.pendingImageSrc === params.requestedImageSrc;
}

export function shouldShowViewportFaceOverlays(params: {
    showFaces: boolean;
    alwaysShowForPanel: boolean;
    committedAssetId: string | null;
    requestedAssetId: string | null;
    isDisplayedImageReady: boolean;
}): boolean {
    const { showFaces, alwaysShowForPanel, committedAssetId, requestedAssetId, isDisplayedImageReady } = params;
    if (!showFaces && !alwaysShowForPanel) {
        return false;
    }

    if (!isDisplayedImageReady || !committedAssetId || !requestedAssetId) {
        return false;
    }

    return committedAssetId === requestedAssetId;
}

export function isViewportImageTransitionPending(params: {
    committedAssetId: string | null;
    requestedAssetId: string | null;
    isDisplayedImageReady: boolean;
}): boolean {
    const { committedAssetId, requestedAssetId, isDisplayedImageReady } = params;
    if (!committedAssetId || !requestedAssetId) {
        return !isDisplayedImageReady;
    }

    return committedAssetId !== requestedAssetId || !isDisplayedImageReady;
}

export function getNextNavButtonRightOffset(params: {
    showInfoPanel: boolean;
    infoPanelWidth: number;
    edgeOffset?: number;
}): number {
    const { showInfoPanel, infoPanelWidth, edgeOffset = 12 } = params;
    if (!showInfoPanel) {
        return edgeOffset;
    }

    return infoPanelWidth + edgeOffset;
}

export function fitViewportStageDimensions(params: {
    viewportWidth: number;
    viewportHeight: number;
    assetWidth: number;
    assetHeight: number;
}): { width: number; height: number } {
    const { viewportWidth, viewportHeight, assetWidth, assetHeight } = params;
    if (viewportWidth <= 0 || viewportHeight <= 0 || assetWidth <= 0 || assetHeight <= 0) {
        return { width: 0, height: 0 };
    }

    const scale = Math.min(viewportWidth / assetWidth, viewportHeight / assetHeight);
    return {
        width: Math.round(assetWidth * scale),
        height: Math.round(assetHeight * scale),
    };
}

export function commitViewportPendingImage(
    state: ViewportImageTransitionState,
): ViewportImageTransitionState {
    const { pendingAsset, pendingImageSrc } = state;
    if (!pendingAsset) {
        return state;
    }

    return {
        activeAsset: pendingAsset,
        activeImageSrc: pendingImageSrc,
        pendingAsset: null,
        pendingImageSrc: null,
        // The hidden pending image only commits after it has already loaded.
        isActiveImageReady: true,
    };
}

export function getViewportStageTransformTransition(params: {
    isDragging: boolean;
    isImageTransitionPending: boolean;
}): 'none' | 'transform 0.15s ease-out' {
    const { isDragging, isImageTransitionPending } = params;
    if (isDragging || isImageTransitionPending) {
        return 'none';
    }

    return 'transform 0.15s ease-out';
}

export function getViewportStageIdentity(params: {
    assetId: string;
    imageSrc: string | null;
}): string {
    const { assetId, imageSrc } = params;
    return `${assetId}::${imageSrc ?? 'missing'}`;
}

export function resolveViewportImageSrc(asset: Asset): string | null {
    return asset.original_path || asset.preview_path || null;
}
