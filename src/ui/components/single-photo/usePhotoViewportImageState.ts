import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { resolveViewportImageSrc, resolveViewportStageAsset, shouldShowViewportFaceOverlays } from './photoViewportImageState';

export function usePhotoViewportImageState(params: {
    asset: Asset;
    showFaces: boolean;
    alwaysShowForPanel: boolean;
}) {
    const { asset, showFaces, alwaysShowForPanel } = params;
    const requestedImagePath = resolveViewportImageSrc(asset);
    const requestedImageSrc = useMemo(() => resolveImageUrl(requestedImagePath), [requestedImagePath]);
    const [committedAsset, setCommittedAsset] = useState<Asset | null>(asset);
    const [committedImageSrc, setCommittedImageSrc] = useState<string | null>(requestedImageSrc);
    const [isRequestedImageReady, setIsRequestedImageReady] = useState(false);
    const requestedAssetRef = useRef(asset);

    useEffect(() => {
        requestedAssetRef.current = asset;
    }, [asset]);

    useEffect(() => {
        if (!requestedImageSrc) {
            setCommittedAsset(requestedAssetRef.current);
            setCommittedImageSrc(null);
            setIsRequestedImageReady(true);
            return;
        }

        let isCancelled = false;
        setIsRequestedImageReady(false);

        const loader = new window.Image();
        const commitRequestedAsset = () => {
            if (isCancelled) {
                return;
            }

            setCommittedAsset(requestedAssetRef.current);
            setCommittedImageSrc(requestedImageSrc);
            setIsRequestedImageReady(true);
        };

        loader.onload = commitRequestedAsset;
        loader.onerror = commitRequestedAsset;
        loader.src = requestedImageSrc;

        if (loader.complete) {
            commitRequestedAsset();
        }

        return () => {
            isCancelled = true;
            loader.onload = null;
            loader.onerror = null;
        };
    }, [asset.id, requestedImageSrc]);

    const stageAsset = resolveViewportStageAsset({
        committedAsset,
        requestedAsset: asset,
        isRequestedImageReady,
    });
    const showFaceOverlays = shouldShowViewportFaceOverlays({
        showFaces,
        alwaysShowForPanel,
        committedAssetId: stageAsset.id,
        requestedAssetId: asset.id,
        isRequestedImageReady,
    });

    return {
        stageAsset,
        stageImageSrc: stageAsset.id === asset.id ? requestedImageSrc : committedImageSrc,
        showFaceOverlays,
    };
}
