import type { Dispatch, FC, MouseEvent, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import { FaceOverlayMap } from './FaceOverlayMap';
import { getViewportStageIdentity, getViewportStageTransformTransition } from './photoViewportImageState';
import { getLoadingBadgeStyle } from './singlePhotoOverlayLayout';

function getStageCursor(params: {
    isImageTransitionPending: boolean;
    scale: number;
    isDragging: boolean;
}): 'progress' | 'grabbing' | 'grab' | 'zoom-in' {
    const { isImageTransitionPending, scale, isDragging } = params;
    if (isImageTransitionPending) {
        return 'progress';
    }

    if (scale > 1) {
        return isDragging ? 'grabbing' : 'grab';
    }

    return 'zoom-in';
}

const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
} as const;

function getStageStyle(params: {
    asset: Asset;
    stageSize: { width: number; height: number } | null;
    pan: { x: number; y: number };
    scale: number;
    isDragging: boolean;
    isImageTransitionPending: boolean;
}) {
    const { asset, stageSize, pan, scale, isDragging, isImageTransitionPending } = params;

    return {
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: stageSize?.width ?? 'auto',
        height: stageSize?.height ?? 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: (asset.width && asset.height) ? `${asset.width} / ${asset.height}` : 'auto',
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        transition: getViewportStageTransformTransition({ isDragging, isImageTransitionPending }),
        cursor: getStageCursor({ isImageTransitionPending, scale, isDragging }),
        willChange: 'transform',
    } as const;
}

const StageImage: FC<{
    src: string;
    alt: string;
    onLoad: () => void;
}> = ({ src, alt, onLoad }) => (
    <img
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onLoad}
        style={imageStyle}
        draggable={false}
    />
);

const PendingStageImage: FC<{
    pendingImageSrc: string | null;
    onPendingImageLoad: () => void;
}> = ({ pendingImageSrc, onPendingImageLoad }) => {
    if (!pendingImageSrc) {
        return null;
    }

    return (
        <img
            src={pendingImageSrc}
            alt=""
            aria-hidden="true"
            onLoad={onPendingImageLoad}
            onError={onPendingImageLoad}
            style={{
                ...imageStyle,
                position: 'absolute',
                inset: 0,
                opacity: 0,
            }}
            draggable={false}
        />
    );
};

const FaceOverlays: FC<{
    overlaysReady: boolean;
    asset: Asset;
    showFaces: boolean;
    alwaysShowForPanel: boolean;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}> = ({
    overlaysReady,
    asset,
    showFaces,
    alwaysShowForPanel,
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace,
}) => {
    if (!overlaysReady) {
        return null;
    }

    return (
        <FaceOverlayMap
            asset={asset}
            showFaces={showFaces}
            alwaysShowForPanel={alwaysShowForPanel}
            hoveredFaceKey={hoveredFaceKey}
            onHoverFaceKey={setHoveredFaceKey}
            onFaceClick={onFaceClick}
            onIsolateFace={onIsolateFace}
        />
    );
};

export const ZoomableStage: FC<{
    asset: Asset;
    imgSrc: string | null;
    pendingImageSrc: string | null;
    stageSize: { width: number; height: number } | null;
    pan: { x: number; y: number };
    scale: number;
    isDragging: boolean;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    showFaces: boolean;
    alwaysShowForPanel: boolean;
    overlaysReady: boolean;
    isImageTransitionPending: boolean;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onActiveImageLoad: () => void;
    onPendingImageLoad: () => void;
}> = ({
    asset,
    imgSrc,
    pendingImageSrc,
    stageSize,
    pan,
    scale,
    isDragging,
    showControls,
    setShowControls,
    setShowActionMenu,
    handleMouseDown,
    showFaces,
    alwaysShowForPanel,
    overlaysReady,
    isImageTransitionPending,
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace,
    onActiveImageLoad,
    onPendingImageLoad,
}) => {
    if (!imgSrc) {
        return <div style={{ color: '#9ca3af' }}>Image not found</div>;
    }

    const stageIdentity = getViewportStageIdentity({
        assetId: asset.id,
        imageSrc: imgSrc,
    });

    return (
        <div
            key={stageIdentity}
            onMouseDown={handleMouseDown}
            onClick={(event) => {
                event.stopPropagation();
                setShowControls(!showControls);
                setShowActionMenu(false);
            }}
            style={getStageStyle({ asset, stageSize, pan, scale, isDragging, isImageTransitionPending })}
        >
            <StageImage src={imgSrc} alt="Original" onLoad={onActiveImageLoad} />
            <PendingStageImage pendingImageSrc={pendingImageSrc} onPendingImageLoad={onPendingImageLoad} />
            <FaceOverlays
                overlaysReady={overlaysReady}
                asset={asset}
                showFaces={showFaces}
                alwaysShowForPanel={alwaysShowForPanel}
                hoveredFaceKey={hoveredFaceKey}
                setHoveredFaceKey={setHoveredFaceKey}
                onFaceClick={onFaceClick}
                onIsolateFace={onIsolateFace}
            />
            {isImageTransitionPending ? <div style={getLoadingBadgeStyle()}>Loading photo...</div> : null}
        </div>
    );
};
