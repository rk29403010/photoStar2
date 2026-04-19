import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import {
    commitViewportPendingImage,
    isViewportImageTransitionPending,
    resolveViewportImageSrc,
    resolveViewportStageAsset,
    shouldShowViewportFaceOverlays,
} from './photoViewportImageState';

function getViewportDebugLabel(asset: Asset, imagePath: string | null): string {
    const filename = (imagePath ?? asset.original_path ?? asset.preview_path ?? asset.id).split(/[/\\]/).pop();
    return `${asset.id} (${filename ?? 'unknown'})`;
}

function logViewportImageRequested(asset: Asset, requestedImagePath: string | null, requestedImageSrc: string) {
    console.info(
        `[PhotoViewport] Requesting full image for ${getViewportDebugLabel(asset, requestedImagePath)} via ${requestedImageSrc.startsWith('http') ? 'bridge' : 'asset'} source`,
    );
}

function logViewportImageCommitted(
    asset: Asset,
    requestedAt: number | null,
    committedAt: number,
) {
    console.info(
        `[PhotoViewport] Committing pending image for ${getViewportDebugLabel(asset, resolveViewportImageSrc(asset))}; preload wait=${requestedAt === null ? 'n/a' : `${Math.round(committedAt - requestedAt)}ms`}`,
    );
}

function logViewportImageReady(
    asset: Asset,
    requestedImagePath: string | null,
    committedAt: number | null,
    completedAt: number,
) {
    console.info(
        `[PhotoViewport] Active image ready for ${getViewportDebugLabel(asset, requestedImagePath)}; decode wait=${committedAt === null ? 'n/a' : `${Math.round(completedAt - committedAt)}ms`}`,
    );
}

export function usePhotoViewportImageState(params: {
    asset: Asset;
    showFaces: boolean;
    alwaysShowForPanel: boolean;
}) {
    const { asset, showFaces, alwaysShowForPanel } = params;
    const requestedImagePath = resolveViewportImageSrc(asset);
    const requestedImageSrc = useMemo(() => resolveImageUrl(requestedImagePath), [requestedImagePath]);
    const [activeAsset, setActiveAsset] = useState<Asset | null>(asset);
    const [activeImageSrc, setActiveImageSrc] = useState<string | null>(requestedImageSrc);
    const [pendingAsset, setPendingAsset] = useState<Asset | null>(null);
    const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
    const [isActiveImageReady, setIsActiveImageReady] = useState(false);
    const pendingImageRequestedAtRef = useRef<number | null>(null);
    const activeImageCommittedAtRef = useRef<number | null>(null);

    useEffect(() => {
        if (!requestedImageSrc) {
            setActiveAsset(asset);
            setActiveImageSrc(null);
            setPendingAsset(null);
            setPendingImageSrc(null);
            setIsActiveImageReady(true);
            return;
        }

        const isAlreadyActive = activeAsset?.id === asset.id && activeImageSrc === requestedImageSrc;
        if (isAlreadyActive) {
            setPendingAsset(null);
            setPendingImageSrc(null);
            return;
        }

        setPendingAsset(asset);
        setPendingImageSrc(requestedImageSrc);
        pendingImageRequestedAtRef.current = performance.now();
        logViewportImageRequested(asset, requestedImagePath, requestedImageSrc);
    }, [activeAsset, activeImageSrc, asset, requestedImagePath, requestedImageSrc]);

    const isAlreadyActiveState = activeAsset?.id === asset.id && activeImageSrc === requestedImageSrc;
    const stageAsset = resolveViewportStageAsset({
        committedAsset: activeAsset,
        requestedAsset: asset,
        isRequestedImageReady: isAlreadyActiveState,
    });
    const isDisplayedImageReady = stageAsset.id === asset.id && pendingImageSrc === null && isActiveImageReady;
    const isImageTransitionPending = isViewportImageTransitionPending({
        committedAssetId: stageAsset.id,
        requestedAssetId: asset.id,
        isDisplayedImageReady,
    });
    const showFaceOverlays = shouldShowViewportFaceOverlays({
        showFaces,
        alwaysShowForPanel,
        committedAssetId: stageAsset.id,
        requestedAssetId: asset.id,
        isDisplayedImageReady,
    });

    return {
        stageAsset,
        stageImageSrc: activeImageSrc,
        pendingImageSrc,
        isImageTransitionPending,
        showFaceOverlays,
        commitPendingImage: () => {
            if (!pendingAsset) {return;}
            activeImageCommittedAtRef.current = performance.now();
            logViewportImageCommitted(pendingAsset, pendingImageRequestedAtRef.current, activeImageCommittedAtRef.current);
            const nextState = commitViewportPendingImage({
                activeAsset,
                activeImageSrc,
                pendingAsset,
                pendingImageSrc,
                isActiveImageReady,
            });
            setActiveAsset(nextState.activeAsset);
            setActiveImageSrc(nextState.activeImageSrc);
            setPendingAsset(nextState.pendingAsset);
            setPendingImageSrc(nextState.pendingImageSrc);
            setIsActiveImageReady(nextState.isActiveImageReady);
        },
        markActiveImageReady: () => {
            const completedAt = performance.now();
            logViewportImageReady(asset, requestedImagePath, activeImageCommittedAtRef.current, completedAt);
            setIsActiveImageReady(true);
        },
    };
}
