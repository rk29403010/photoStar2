import type { Dispatch, FC, MouseEvent, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import { FaceOverlayMap } from './FaceOverlayMap';
import { getExplicitViewportFrameCrop, getViewportStageIdentity, getViewportStageTransformTransition } from './photoViewportImageState';
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

function getStageStyle(params: {
    asset: Asset;
    stageSize: { width: number; height: number } | null;
    pan: { x: number; y: number };
    scale: number;
    isDragging: boolean;
    isImageTransitionPending: boolean;
    shouldCrop: boolean;
    interiorBox: { x: number; y: number; width: number; height: number } | null;
}) {
    const { asset, stageSize, pan, scale, isDragging, isImageTransitionPending, shouldCrop, interiorBox } = params;

    let aspect = 'auto';
    if (asset.width && asset.height) {
        if (shouldCrop && interiorBox) {
            aspect = `${asset.width * interiorBox.width} / ${asset.height * interiorBox.height}`;
        } else {
            aspect = `${asset.width} / ${asset.height}`;
        }
    }

    return {
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: stageSize?.width ?? 'auto',
        height: stageSize?.height ?? 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: aspect,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        transition: getViewportStageTransformTransition({ isDragging, isImageTransitionPending }),
        cursor: getStageCursor({ isImageTransitionPending, scale, isDragging }),
        willChange: 'transform',
        overflow: shouldCrop ? 'hidden' : 'visible',
    } as const;
}

const StageImage: FC<{
    readonly src: string;
    readonly alt: string;
    readonly onLoad: () => void;
    readonly style: React.CSSProperties;
}> = ({ src, alt, onLoad, style }) => (
    <img loading="lazy"
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onLoad}
        style={style}
        draggable={false}
    />
);

const PendingStageImage: FC<{
    readonly pendingImageSrc: string | null;
    readonly onPendingImageLoad: () => void;
    readonly style: React.CSSProperties;
}> = ({ pendingImageSrc, onPendingImageLoad, style }) => {
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
                ...style,
                position: 'absolute',
                opacity: 0,
            }}
            draggable={false}
        />
    );
};

const FaceOverlays: FC<{
    readonly overlaysReady: boolean;
    readonly asset: Asset;
    readonly showFaces: boolean;
    readonly alwaysShowForPanel: boolean;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly showWithFrame?: boolean;
}> = ({
    overlaysReady,
    asset,
    showFaces,
    alwaysShowForPanel,
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace,
    showWithFrame,
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
            showWithFrame={showWithFrame}
        />
    );
};

export const ZoomableStage: FC<{
    readonly asset: Asset;
    readonly imgSrc: string | null;
    readonly pendingImageSrc: string | null;
    readonly stageSize: { width: number; height: number } | null;
    readonly pan: { x: number; y: number };
    readonly scale: number;
    readonly isDragging: boolean;
    readonly showControls: boolean;
    readonly setShowControls: Dispatch<SetStateAction<boolean>>;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    readonly handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    readonly showFaces: boolean;
    readonly alwaysShowForPanel: boolean;
    readonly overlaysReady: boolean;
    readonly isImageTransitionPending: boolean;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly onActiveImageLoad: () => void;
    readonly onPendingImageLoad: () => void;
    readonly showWithFrame?: boolean;
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
    showWithFrame,
}) => {
    if (!imgSrc) {
        return <div style={{ color: '#9ca3af' }}>Image not found</div>;
    }

    const stageIdentity = getViewportStageIdentity({
        assetId: asset.id,
        imageSrc: imgSrc,
    });

    const interiorBox = getExplicitViewportFrameCrop({
        frameDetection: asset.frame_detection,
        showWithFrame,
    });
    const shouldCrop = interiorBox !== null;

    const customImageStyle = shouldCrop && interiorBox
        ? {
            width: `${100 / interiorBox.width}%`,
            height: `${100 / interiorBox.height}%`,
            left: `${-interiorBox.x * 100 / interiorBox.width}%`,
            top: `${-interiorBox.y * 100 / interiorBox.height}%`,
            position: 'absolute' as const,
            objectFit: 'fill' as const,
            pointerEvents: 'none' as const,
          }
        : {
            width: '100%',
            height: '100%',
            objectFit: 'contain' as const,
            pointerEvents: 'none' as const,
          };

    return (
        <div
            key={stageIdentity}
            onMouseDown={handleMouseDown}
            onClick={(event) => {
                event.stopPropagation();
                setShowControls(!showControls);
                setShowActionMenu(false);
            }}
            style={getStageStyle({ asset, stageSize, pan, scale, isDragging, isImageTransitionPending, shouldCrop, interiorBox })}
        >
            <StageImage src={imgSrc} alt="Original" onLoad={onActiveImageLoad} style={customImageStyle} />
            <PendingStageImage pendingImageSrc={pendingImageSrc} onPendingImageLoad={onPendingImageLoad} style={customImageStyle} />
            <FaceOverlays
                overlaysReady={overlaysReady}
                asset={asset}
                showFaces={showFaces}
                alwaysShowForPanel={alwaysShowForPanel}
                hoveredFaceKey={hoveredFaceKey}
                setHoveredFaceKey={setHoveredFaceKey}
                onFaceClick={onFaceClick}
                onIsolateFace={onIsolateFace}
                showWithFrame={showWithFrame}
            />
            {isImageTransitionPending ? <div style={getLoadingBadgeStyle()}>Loading photo...</div> : null}
        </div>
    );
};
