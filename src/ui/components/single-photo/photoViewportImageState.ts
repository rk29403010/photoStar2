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
    showOverlays: boolean;
    committedAssetId: string | null;
    requestedAssetId: string | null;
    isDisplayedImageReady: boolean;
}): boolean {
    const { showOverlays, committedAssetId, requestedAssetId, isDisplayedImageReady } = params;
    if (!showOverlays) {
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

type NormalizedFrameBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function isNormalizedFrameBox(box: NormalizedFrameBox): boolean {
    return Number.isFinite(box.x)
        && Number.isFinite(box.y)
        && Number.isFinite(box.width)
        && Number.isFinite(box.height)
        && box.x >= 0
        && box.y >= 0
        && box.width > 0
        && box.height > 0
        && box.x + box.width <= 1
        && box.y + box.height <= 1;
}

function readNormalizedFrameBox(value: unknown): NormalizedFrameBox | null {
    if (!isUnknownRecord(value)) {
        return null;
    }

    if (
        typeof value.x !== 'number'
        || typeof value.y !== 'number'
        || typeof value.width !== 'number'
        || typeof value.height !== 'number'
    ) {
        return null;
    }

    const box = {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
    };
    return isNormalizedFrameBox(box) ? box : null;
}

function isNormalizedCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readNormalizedPoint(value: unknown): { x: number; y: number } | null {
    if (!isUnknownRecord(value)) {
        return null;
    }

    const { x, y } = value;
    return isNormalizedCoordinate(x) && isNormalizedCoordinate(y) ? { x, y } : null;
}

function getPolygonFrameBox(points: unknown): NormalizedFrameBox | null {
    if (!Array.isArray(points) || points.length === 0) {
        return null;
    }

    const coordinates = points.map(readNormalizedPoint);
    if (coordinates.some((point) => point === null)) {
        return null;
    }

    const validPoints = coordinates.filter((point): point is { x: number; y: number } => point !== null);
    const minX = Math.min(...validPoints.map((point) => point.x));
    const maxX = Math.max(...validPoints.map((point) => point.x));
    const minY = Math.min(...validPoints.map((point) => point.y));
    const maxY = Math.max(...validPoints.map((point) => point.y));
    return readNormalizedFrameBox({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

/**
 * Frame analysis must never alter the default single-photo presentation. A
 * detected frame is only used as an explicit, safely bounded display crop.
 */
export function getExplicitViewportFrameCrop(params: {
    frameDetection: unknown;
    showWithFrame: boolean | undefined;
}): NormalizedFrameBox | null {
    if (params.showWithFrame) {
        return null;
    }

    if (!isUnknownRecord(params.frameDetection)) {
        return null;
    }

    if (params.frameDetection.type === 'rectangle') {
        return readNormalizedFrameBox(params.frameDetection.box);
    }

    return params.frameDetection.type === 'polygon' ? getPolygonFrameBox(params.frameDetection.points) : null;
}
