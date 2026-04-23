import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Asset } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import {
    commitViewportPendingImage,
    getViewportImageTransitionKey,
    isViewportImageTransitionAlreadyActive,
    isViewportImageTransitionAlreadyPending,
    isViewportImageTransitionPending,
    resolveViewportImageSrc,
    resolveViewportStageAsset,
    shouldQueueViewportImageTransition,
    shouldSuppressRepeatedViewportTransition,
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

function resetViewportImageState(params: {
    asset: Asset;
    setActiveAsset: (asset: Asset | null) => void;
    setActiveImageSrc: (imageSrc: string | null) => void;
    setPendingAsset: (asset: Asset | null) => void;
    setPendingImageSrc: (imageSrc: string | null) => void;
    setIsActiveImageReady: (ready: boolean) => void;
}) {
    params.setActiveAsset(params.asset);
    params.setActiveImageSrc(null);
    params.setPendingAsset(null);
    params.setPendingImageSrc(null);
    params.setIsActiveImageReady(true);
}

function clearPendingViewportImage(params: {
    setPendingAsset: (asset: Asset | null) => void;
    setPendingImageSrc: (imageSrc: string | null) => void;
}) {
    params.setPendingAsset(null);
    params.setPendingImageSrc(null);
}

function requestViewportImageTransition(params: {
    asset: Asset;
    requestedImagePath: string | null;
    requestedImageSrc: string;
    transitionKey: string;
    setPendingAsset: (asset: Asset | null) => void;
    setPendingImageSrc: (imageSrc: string | null) => void;
    pendingImageRequestedAtRef: MutableRefObject<number | null>;
    lastRequestedTransitionKeyRef: MutableRefObject<string | null>;
}) {
    params.setPendingAsset(params.asset);
    params.setPendingImageSrc(params.requestedImageSrc);
    params.pendingImageRequestedAtRef.current = performance.now();
    params.lastRequestedTransitionKeyRef.current = params.transitionKey;
    logViewportImageRequested(params.asset, params.requestedImagePath, params.requestedImageSrc);
}

function commitRequestedViewportImage(params: {
    activeAsset: Asset | null;
    activeImageSrc: string | null;
    pendingAsset: Asset;
    pendingImageSrc: string | null;
    isActiveImageReady: boolean;
    pendingImageRequestedAtRef: MutableRefObject<number | null>;
    activeImageCommittedAtRef: MutableRefObject<number | null>;
    setActiveAsset: (asset: Asset | null) => void;
    setActiveImageSrc: (imageSrc: string | null) => void;
    setPendingAsset: (asset: Asset | null) => void;
    setPendingImageSrc: (imageSrc: string | null) => void;
    setIsActiveImageReady: (ready: boolean) => void;
    lastRequestedTransitionKeyRef: MutableRefObject<string | null>;
}) {
    params.activeImageCommittedAtRef.current = performance.now();
    params.lastRequestedTransitionKeyRef.current = null;
    logViewportImageCommitted(
        params.pendingAsset,
        params.pendingImageRequestedAtRef.current,
        params.activeImageCommittedAtRef.current,
    );
    const nextState = commitViewportPendingImage({
        activeAsset: params.activeAsset,
        activeImageSrc: params.activeImageSrc,
        pendingAsset: params.pendingAsset,
        pendingImageSrc: params.pendingImageSrc,
        isActiveImageReady: params.isActiveImageReady,
    });
    params.setActiveAsset(nextState.activeAsset);
    params.setActiveImageSrc(nextState.activeImageSrc);
    params.setPendingAsset(nextState.pendingAsset);
    params.setPendingImageSrc(nextState.pendingImageSrc);
    params.setIsActiveImageReady(nextState.isActiveImageReady);
}

type ViewportRequestedImageEffectParams = {
    asset: Asset;
    requestedImagePath: string | null;
    requestedImageSrc: string | null;
    activeAssetId: string | null;
    activeImageSrc: string | null;
    pendingAssetId: string | null;
    pendingImageSrc: string | null;
    setActiveAsset: (asset: Asset | null) => void;
    setActiveImageSrc: (imageSrc: string | null) => void;
    setPendingAsset: (asset: Asset | null) => void;
    setPendingImageSrc: (imageSrc: string | null) => void;
    setIsActiveImageReady: (ready: boolean) => void;
    pendingImageRequestedAtRef: MutableRefObject<number | null>;
    lastRequestedTransitionKeyRef: MutableRefObject<string | null>;
};

type ViewportRequestedImageEffectAction = {
    type: 'request';
    transitionKey: string;
} | {
    type: 'reset' | 'clear_pending' | 'skip';
};

function resolveViewportRequestedImageEffectAction(
    params: ViewportRequestedImageEffectParams,
): ViewportRequestedImageEffectAction {
    if (!params.requestedImageSrc) {
        return { type: 'reset' };
    }

    if (isViewportImageTransitionAlreadyActive({
        activeAssetId: params.activeAssetId,
        requestedAssetId: params.asset.id,
        activeImageSrc: params.activeImageSrc,
        requestedImageSrc: params.requestedImageSrc,
    })) {
        return { type: 'clear_pending' };
    }

    if (isViewportImageTransitionAlreadyPending({
        pendingAssetId: params.pendingAssetId,
        pendingImageSrc: params.pendingImageSrc,
        requestedAssetId: params.asset.id,
        requestedImageSrc: params.requestedImageSrc,
    })) {
        return { type: 'skip' };
    }

    if (!shouldQueueViewportImageTransition({
        activeAssetId: params.activeAssetId,
        requestedAssetId: params.asset.id,
        activeImageSrc: params.activeImageSrc,
        requestedImageSrc: params.requestedImageSrc,
        pendingAssetId: params.pendingAssetId,
        pendingImageSrc: params.pendingImageSrc,
    })) {
        return { type: 'skip' };
    }

    const transitionKey = getViewportImageTransitionKey({
        requestedAssetId: params.asset.id,
        requestedImageSrc: params.requestedImageSrc,
    });

    if (shouldSuppressRepeatedViewportTransition({
        lastRequestedTransitionKey: params.lastRequestedTransitionKeyRef.current,
        requestedAssetId: params.asset.id,
        requestedImageSrc: params.requestedImageSrc,
    })) {
        return { type: 'skip' };
    }

    return {
        type: 'request',
        transitionKey,
    };
}

function applyViewportRequestedImageEffectAction(
    params: ViewportRequestedImageEffectParams,
    action: ViewportRequestedImageEffectAction,
) {
    if (action.type === 'reset') {
        params.lastRequestedTransitionKeyRef.current = null;
        resetViewportImageState({
            asset: params.asset,
            setActiveAsset: params.setActiveAsset,
            setActiveImageSrc: params.setActiveImageSrc,
            setPendingAsset: params.setPendingAsset,
            setPendingImageSrc: params.setPendingImageSrc,
            setIsActiveImageReady: params.setIsActiveImageReady,
        });
        return;
    }

    if (action.type === 'clear_pending') {
        params.lastRequestedTransitionKeyRef.current = null;
        clearPendingViewportImage({
            setPendingAsset: params.setPendingAsset,
            setPendingImageSrc: params.setPendingImageSrc,
        });
        return;
    }

    if (action.type !== 'request') {
        return;
    }

    const requestedImageSrc = params.requestedImageSrc;
    if (!requestedImageSrc) {
        return;
    }

    // Asset detail refreshes can swap in a new object for the same image while
    // the previous hidden preload is still unwinding. Suppress re-requesting the
    // identical full image until the current transition either commits or settles.
    requestViewportImageTransition({
        asset: params.asset,
        requestedImagePath: params.requestedImagePath,
        requestedImageSrc,
        transitionKey: action.transitionKey,
        setPendingAsset: params.setPendingAsset,
        setPendingImageSrc: params.setPendingImageSrc,
        pendingImageRequestedAtRef: params.pendingImageRequestedAtRef,
        lastRequestedTransitionKeyRef: params.lastRequestedTransitionKeyRef,
    });
}

function useViewportRequestedImageEffect(params: ViewportRequestedImageEffectParams) {
    const {
        activeAssetId,
        activeImageSrc,
        asset,
        lastRequestedTransitionKeyRef,
        pendingAssetId,
        pendingImageSrc,
        pendingImageRequestedAtRef,
        requestedImagePath,
        requestedImageSrc,
        setActiveAsset,
        setActiveImageSrc,
        setIsActiveImageReady,
        setPendingAsset,
        setPendingImageSrc,
    } = params;

    useEffect(() => {
        const effectParams = {
            activeAssetId,
            activeImageSrc,
            asset,
            lastRequestedTransitionKeyRef,
            pendingAssetId,
            pendingImageSrc,
            pendingImageRequestedAtRef,
            requestedImagePath,
            requestedImageSrc,
            setActiveAsset,
            setActiveImageSrc,
            setIsActiveImageReady,
            setPendingAsset,
            setPendingImageSrc,
        };

        applyViewportRequestedImageEffectAction(
            effectParams,
            resolveViewportRequestedImageEffectAction(effectParams),
        );
    }, [
        activeAssetId,
        activeImageSrc,
        asset,
        lastRequestedTransitionKeyRef,
        pendingAssetId,
        pendingImageSrc,
        pendingImageRequestedAtRef,
        requestedImagePath,
        requestedImageSrc,
        setActiveAsset,
        setActiveImageSrc,
        setIsActiveImageReady,
        setPendingAsset,
        setPendingImageSrc,
    ]);
}

function getViewportDisplayState(params: {
    activeAsset: Asset | null;
    asset: Asset;
    activeImageSrc: string | null;
    requestedImageSrc: string | null;
    pendingImageSrc: string | null;
    isActiveImageReady: boolean;
    showFaces: boolean;
    alwaysShowForPanel: boolean;
}) {
    const isAlreadyActiveState = params.activeAsset?.id === params.asset.id && params.activeImageSrc === params.requestedImageSrc;
    const stageAsset = resolveViewportStageAsset({
        committedAsset: params.activeAsset,
        requestedAsset: params.asset,
        isRequestedImageReady: isAlreadyActiveState,
    });
    const isDisplayedImageReady = stageAsset.id === params.asset.id && params.pendingImageSrc === null && params.isActiveImageReady;

    return {
        stageAsset,
        isImageTransitionPending: isViewportImageTransitionPending({
            committedAssetId: stageAsset.id,
            requestedAssetId: params.asset.id,
            isDisplayedImageReady,
        }),
        showFaceOverlays: shouldShowViewportFaceOverlays({
            showFaces: params.showFaces,
            alwaysShowForPanel: params.alwaysShowForPanel,
            committedAssetId: stageAsset.id,
            requestedAssetId: params.asset.id,
            isDisplayedImageReady,
        }),
    };
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
    const lastRequestedTransitionKeyRef = useRef<string | null>(null);
    useViewportRequestedImageEffect({
        asset,
        requestedImagePath,
        requestedImageSrc,
        activeAssetId: activeAsset?.id ?? null,
        activeImageSrc,
        pendingAssetId: pendingAsset?.id ?? null,
        pendingImageSrc,
        setActiveAsset,
        setActiveImageSrc,
        setPendingAsset,
        setPendingImageSrc,
        setIsActiveImageReady,
        pendingImageRequestedAtRef,
        lastRequestedTransitionKeyRef,
    });

    const { stageAsset, isImageTransitionPending, showFaceOverlays } = getViewportDisplayState({
        activeAsset,
        asset,
        activeImageSrc,
        requestedImageSrc,
        pendingImageSrc,
        isActiveImageReady,
        showFaces,
        alwaysShowForPanel,
    });

    return {
        stageAsset,
        stageImageSrc: activeImageSrc,
        pendingImageSrc,
        isImageTransitionPending,
        showFaceOverlays,
        commitPendingImage: () => {
            if (!pendingAsset) {return;}
            commitRequestedViewportImage({
                activeAsset,
                activeImageSrc,
                pendingAsset,
                pendingImageSrc,
                isActiveImageReady,
                pendingImageRequestedAtRef,
                activeImageCommittedAtRef,
                setActiveAsset,
                setActiveImageSrc,
                setPendingAsset,
                setPendingImageSrc,
                setIsActiveImageReady,
                lastRequestedTransitionKeyRef,
            });
        },
        markActiveImageReady: () => {
            const completedAt = performance.now();
            logViewportImageReady(asset, requestedImagePath, activeImageCommittedAtRef.current, completedAt);
            setIsActiveImageReady(true);
        },
    };
}
