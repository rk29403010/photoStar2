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

function useSyncedCurrent<T>(value: T) {
    const ref = useRef(value);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref;
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
    const activeAssetRef = useSyncedCurrent<Asset | null>(activeAsset);
    const activeImageSrcRef = useSyncedCurrent<string | null>(activeImageSrc);
    const pendingAssetRef = useSyncedCurrent<Asset | null>(pendingAsset);
    const pendingImageSrcRef = useSyncedCurrent<string | null>(pendingImageSrc);
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
    }, [activeAsset, activeImageSrc, asset, requestedImageSrc]);
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
            const nextPendingAsset = pendingAssetRef.current;
            const nextPendingImageSrc = pendingImageSrcRef.current;
            if (!nextPendingAsset) {
                return;
            }

            const nextState = commitViewportPendingImage({
                activeAsset: activeAssetRef.current,
                activeImageSrc: activeImageSrcRef.current,
                pendingAsset: nextPendingAsset,
                pendingImageSrc: nextPendingImageSrc,
                isActiveImageReady,
            });
            setActiveAsset(nextState.activeAsset);
            setActiveImageSrc(nextState.activeImageSrc);
            setPendingAsset(nextState.pendingAsset);
            setPendingImageSrc(nextState.pendingImageSrc);
            setIsActiveImageReady(nextState.isActiveImageReady);
        },
        markActiveImageReady: () => setIsActiveImageReady(true),
    };
}
