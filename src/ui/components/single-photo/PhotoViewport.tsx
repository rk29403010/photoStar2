import { useEffect, useRef, useState } from 'react';
import type { Dispatch, FC, MouseEvent, RefObject, SetStateAction } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import { usePanZoom } from '../../hooks/usePanZoom';
import { FaceOverlayMap } from './FaceOverlayMap';
import { ActionOverlays } from './ActionOverlays';
import { VariantFilmstripOverlay } from './PhotoViewportFilmstrip';
import { applyActiveGroupContext } from './singlePhotoAssetModel';
import { useKeyboardNavigation, useViewportGroupActions } from './photoViewportInteractions';
import { usePhotoViewportImageState } from './usePhotoViewportImageState';
export interface PanelState { showInfoPanel: boolean; setShowInfoPanel: (v: boolean) => void; activeInfoTab: 'file' | 'analysis' | 'people' | 'json'; setActiveInfoTab: (tab: 'file' | 'analysis' | 'people' | 'json') => void }
export interface AnalysisState { analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error'; setAnalysisState: Dispatch<SetStateAction<'idle' | 'analyzing' | 'cancelling' | 'error'>>; analysisError: string | null; setAnalysisError: Dispatch<SetStateAction<string | null>>; analyzingAssetId: string | null; setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>; setAnalyzingJobId: Dispatch<SetStateAction<string | null>> }
interface PhotoViewportProps { asset: Asset; assetsLength: number; currentIndex: number; showControls: boolean; setShowControls: Dispatch<SetStateAction<boolean>>; showFaces: boolean; setShowFaces: Dispatch<SetStateAction<boolean>>; showActionMenu: boolean; setShowActionMenu: Dispatch<SetStateAction<boolean>>; hoveredFaceKey: string | null; setHoveredFaceKey: Dispatch<SetStateAction<string | null>>; panelState: PanelState; onClose: () => void; onFaceClick?: (personId: string, personName: string) => void; onIsolateFace?: (assetId: string, faceIndex: number) => void; onSetSensitivity?: (assetId: string, status: string | null) => void; onExtractAiMetadata?: (assetId: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>; onOpenSettings?: () => void; onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>; onOrbitLoaded: (assets: Asset[]) => void; onSelectAsset: (assetId: string) => void; onSetCanonical?: (groupId: string, assetId: string) => Promise<void>; onExplodeGroup?: (groupId: string) => Promise<void>; onChangeIndex: (delta: -1 | 1) => void; analysis: AnalysisState; onRevealControls: () => void }

const ZoomableStage: FC<{
    asset: Asset;
    imgSrc: string | null;
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
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}> = ({
    asset,
    imgSrc,
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
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace
}) => {
    if (!imgSrc) {return <div style={{ color: '#9ca3af' }}>Image not found</div>;}

    return (
        <div
            onMouseDown={handleMouseDown}
            onClick={(e) => {
                e.stopPropagation();
                setShowControls(!showControls);
                setShowActionMenu(false);
            }}
            style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                maxWidth: '100%',
                maxHeight: '100%',
                aspectRatio: (asset?.width && asset?.height) ? `${asset.width} / ${asset.height}` : 'auto',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                willChange: 'transform'
            }}
        >
            <img src={imgSrc} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} draggable={false} />
            {overlaysReady ? (
                <FaceOverlayMap
                    asset={asset}
                    showFaces={showFaces}
                    alwaysShowForPanel={alwaysShowForPanel}
                    hoveredFaceKey={hoveredFaceKey}
                    onHoverFaceKey={setHoveredFaceKey}
                    onFaceClick={onFaceClick}
                    onIsolateFace={onIsolateFace}
                />
            ) : null}
        </div>
    );
};

const ViewportActions: FC<{
    asset: Asset;
    assetsLength: number;
    currentIndex: number;
    showControls: boolean;
    showActionMenu: boolean;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    showFaces: boolean;
    setShowFaces: Dispatch<SetStateAction<boolean>>;
    panelState: PanelState;
    scale: number;
    setScale: Dispatch<SetStateAction<number>>;
    setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    resetPanZoom: () => void;
    onClose: () => void;
    onChangeIndex: (delta: -1 | 1) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onExtractAiMetadata?: (assetId: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>;
    onOpenSettings?: () => void;
    analysis: AnalysisState;
}> = ({
    asset,
    assetsLength,
    currentIndex,
    showControls,
    showActionMenu,
    setShowActionMenu,
    showFaces,
    setShowFaces,
    panelState,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onChangeIndex,
    onSetSensitivity,
    onSetCanonical,
    onExplodeGroup,
    onExtractAiMetadata,
    onOpenSettings,
    analysis
}) => (
    <ActionOverlays
        asset={asset}
        assetsLength={assetsLength}
        currentIndex={currentIndex}
        showControls={showControls}
        showActionMenu={showActionMenu}
        setShowActionMenu={setShowActionMenu}
        showFaces={showFaces}
        setShowFaces={setShowFaces}
        showInfoPanel={panelState.showInfoPanel}
        setShowInfoPanel={panelState.setShowInfoPanel}
        scale={scale}
        setScale={setScale}
        setPan={setPan}
        resetPanZoom={resetPanZoom}
        onClose={onClose}
        onPrevious={() => onChangeIndex(-1)}
        onNext={() => onChangeIndex(1)}
        onSetSensitivity={onSetSensitivity}
        onSetCanonical={onSetCanonical}
        onExplodeGroup={onExplodeGroup}
        onExtractAiMetadata={onExtractAiMetadata}
        onOpenSettings={onOpenSettings}
        analysisState={analysis.analysisState}
        setAnalysisState={analysis.setAnalysisState}
        analysisError={analysis.analysisError}
        setAnalysisError={analysis.setAnalysisError}
        analyzingAssetId={analysis.analyzingAssetId}
        setAnalyzingAssetId={analysis.setAnalyzingAssetId}
        setAnalyzingJobId={analysis.setAnalyzingJobId}
    />
);

type PhotoViewportFrameProps = {
    containerRef: RefObject<HTMLDivElement | null>;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    asset: Asset;
    actionAsset: Asset;
    imgSrc: string | null;
    pan: { x: number; y: number };
    scale: number;
    isDragging: boolean;
    handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    showFaces: boolean;
    showFaceOverlays: boolean;
    panelState: PanelState;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    assetsLength: number;
    currentIndex: number;
    showActionMenu: boolean;
    setShowFaces: Dispatch<SetStateAction<boolean>>;
    setScale: Dispatch<SetStateAction<number>>;
    setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    resetPanZoom: () => void;
    onClose: () => void;
    onChangeIndex: (delta: -1 | 1) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onExtractAiMetadata?: (assetId: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>;
    onOpenSettings?: () => void;
    analysis: AnalysisState;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
    onActiveGroupChange: (groupId: string) => void;
    onRevealControls: () => void;
};

const frameStyle = { flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const;

const ViewportStageFrame: FC<Pick<PhotoViewportFrameProps, 'containerRef' | 'showControls' | 'setShowControls' | 'setShowActionMenu' | 'asset' | 'imgSrc' | 'pan' | 'scale' | 'isDragging' | 'handleMouseDown' | 'showFaces' | 'showFaceOverlays' | 'panelState' | 'hoveredFaceKey' | 'setHoveredFaceKey' | 'onFaceClick' | 'onIsolateFace' | 'onRevealControls'>> = ({
    containerRef,
    showControls,
    setShowControls,
    setShowActionMenu,
    asset,
    imgSrc,
    pan,
    scale,
    isDragging,
    handleMouseDown,
    showFaces,
    showFaceOverlays,
    panelState,
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace,
    onRevealControls,
}) => {
    const alwaysShowForPanel = panelState.showInfoPanel && panelState.activeInfoTab === 'people';

    return (
        <div
            ref={containerRef}
            style={frameStyle}
            onMouseMove={onRevealControls}
            onClick={() => {
                setShowControls(!showControls);
                setShowActionMenu(false);
            }}
        >
            <ZoomableStage
                asset={asset}
                imgSrc={imgSrc}
                pan={pan}
                scale={scale}
                isDragging={isDragging}
                showControls={showControls}
                setShowControls={setShowControls}
                setShowActionMenu={setShowActionMenu}
                handleMouseDown={handleMouseDown}
                showFaces={showFaces}
                alwaysShowForPanel={alwaysShowForPanel}
                overlaysReady={showFaceOverlays}
                hoveredFaceKey={hoveredFaceKey}
                setHoveredFaceKey={setHoveredFaceKey}
                onFaceClick={onFaceClick}
                onIsolateFace={onIsolateFace}
            />
        </div>
    );
};

const ViewportDecorations: FC<Pick<PhotoViewportFrameProps, 'asset' | 'assetsLength' | 'currentIndex' | 'showControls' | 'showActionMenu' | 'setShowActionMenu' | 'showFaces' | 'setShowFaces' | 'panelState' | 'scale' | 'setScale' | 'setPan' | 'resetPanZoom' | 'onClose' | 'onChangeIndex' | 'onSetSensitivity' | 'onSetCanonical' | 'onExplodeGroup' | 'onExtractAiMetadata' | 'onOpenSettings' | 'analysis' | 'onGetGroupOrbit' | 'onOrbitLoaded' | 'onSelectAsset'> & { actionAsset: Asset; onActiveGroupChange: (groupId: string) => void }> = ({
    asset,
    actionAsset,
    assetsLength,
    currentIndex,
    showControls,
    showActionMenu,
    setShowActionMenu,
    showFaces,
    setShowFaces,
    panelState,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onChangeIndex,
    onSetSensitivity,
    onSetCanonical,
    onExplodeGroup,
    onExtractAiMetadata,
    onOpenSettings,
    analysis,
    onGetGroupOrbit,
    onOrbitLoaded,
    onSelectAsset,
    onActiveGroupChange,
}) => (
    <>
        <ViewportActions
            asset={actionAsset}
            assetsLength={assetsLength}
            currentIndex={currentIndex}
            showControls={showControls}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            showFaces={showFaces}
            setShowFaces={setShowFaces}
            panelState={panelState}
            scale={scale}
            setScale={setScale}
            setPan={setPan}
            resetPanZoom={resetPanZoom}
            onClose={onClose}
            onChangeIndex={onChangeIndex}
            onSetSensitivity={onSetSensitivity}
            onSetCanonical={onSetCanonical}
            onExplodeGroup={onExplodeGroup}
            onExtractAiMetadata={onExtractAiMetadata}
            onOpenSettings={onOpenSettings}
            analysis={analysis}
        />

        <VariantFilmstripOverlay
            asset={asset}
            onGetGroupOrbit={onGetGroupOrbit}
            onOrbitLoaded={onOrbitLoaded}
            onSelectAsset={onSelectAsset}
            onActiveGroupChange={onActiveGroupChange}
        />
    </>
);

const PhotoViewportFrame: FC<PhotoViewportFrameProps> = (props) => {
    return (
        <>
            <ViewportStageFrame
                containerRef={props.containerRef}
                showControls={props.showControls}
                setShowControls={props.setShowControls}
                setShowActionMenu={props.setShowActionMenu}
                asset={props.asset}
                imgSrc={props.imgSrc}
                pan={props.pan}
                scale={props.scale}
                isDragging={props.isDragging}
                handleMouseDown={props.handleMouseDown}
                showFaces={props.showFaces}
                showFaceOverlays={props.showFaceOverlays}
                panelState={props.panelState}
                hoveredFaceKey={props.hoveredFaceKey}
                setHoveredFaceKey={props.setHoveredFaceKey}
                onFaceClick={props.onFaceClick}
                onIsolateFace={props.onIsolateFace}
                onRevealControls={props.onRevealControls}
            />
            <ViewportDecorations
                asset={props.asset}
                actionAsset={props.actionAsset}
                assetsLength={props.assetsLength}
                currentIndex={props.currentIndex}
                showControls={props.showControls}
                showActionMenu={props.showActionMenu}
                setShowActionMenu={props.setShowActionMenu}
                showFaces={props.showFaces}
                setShowFaces={props.setShowFaces}
                panelState={props.panelState}
                scale={props.scale}
                setScale={props.setScale}
                setPan={props.setPan}
                resetPanZoom={props.resetPanZoom}
                onClose={props.onClose}
                onChangeIndex={props.onChangeIndex}
                onSetSensitivity={props.onSetSensitivity}
                onSetCanonical={props.onSetCanonical}
                onExplodeGroup={props.onExplodeGroup}
                onExtractAiMetadata={props.onExtractAiMetadata}
                onOpenSettings={props.onOpenSettings}
                analysis={props.analysis}
                onGetGroupOrbit={props.onGetGroupOrbit}
                onOrbitLoaded={props.onOrbitLoaded}
                onSelectAsset={props.onSelectAsset}
                onActiveGroupChange={props.onActiveGroupChange}
            />
        </>
    );
};

export const PhotoViewport: FC<PhotoViewportProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scale, setScale, pan, setPan, isDragging, handleMouseDown, resetPanZoom } = usePanZoom(containerRef);
    const groupActions = useViewportGroupActions(props.onSetCanonical, props.onExplodeGroup);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(props.asset.group_id ?? null);
    const actionAsset = applyActiveGroupContext(props.asset, activeGroupId);
    const alwaysShowForPanel = props.panelState.showInfoPanel && props.panelState.activeInfoTab === 'people';
    const {
        stageAsset,
        stageImageSrc,
        showFaceOverlays,
    } = usePhotoViewportImageState({
        asset: props.asset,
        showFaces: props.showFaces,
        alwaysShowForPanel,
    });

    useEffect(() => {
        setActiveGroupId(props.asset.group_id ?? null);
    }, [props.asset.group_id, props.asset.id]);

    useKeyboardNavigation({
        assetsLength: props.assetsLength,
        onClose: props.onClose,
        resetPanZoom,
        showInfoPanel: props.panelState.showInfoPanel,
        setShowInfoPanel: props.panelState.setShowInfoPanel,
        onChangeIndex: props.onChangeIndex
    });

    return (
        <PhotoViewportFrame
            containerRef={containerRef}
            showControls={props.showControls}
            setShowControls={props.setShowControls}
            setShowActionMenu={props.setShowActionMenu}
            asset={stageAsset}
            imgSrc={stageImageSrc}
            pan={pan}
            scale={scale}
            isDragging={isDragging}
            handleMouseDown={handleMouseDown}
            showFaces={props.showFaces}
            showFaceOverlays={showFaceOverlays}
            panelState={props.panelState}
            hoveredFaceKey={props.hoveredFaceKey}
            setHoveredFaceKey={props.setHoveredFaceKey}
            onFaceClick={props.onFaceClick}
            onIsolateFace={props.onIsolateFace}
            assetsLength={props.assetsLength}
            currentIndex={props.currentIndex}
            showActionMenu={props.showActionMenu}
            setShowFaces={props.setShowFaces}
            setScale={setScale}
            setPan={setPan}
            resetPanZoom={resetPanZoom}
            onClose={props.onClose}
            onChangeIndex={props.onChangeIndex}
            onSetSensitivity={props.onSetSensitivity}
            onSetCanonical={groupActions.handleSetCanonical}
            onExplodeGroup={groupActions.handleExplodeGroup}
            onExtractAiMetadata={props.onExtractAiMetadata}
            onOpenSettings={props.onOpenSettings}
            analysis={props.analysis}
            onGetGroupOrbit={props.onGetGroupOrbit}
            onOrbitLoaded={props.onOrbitLoaded}
            onSelectAsset={props.onSelectAsset}
            onRevealControls={props.onRevealControls}
            actionAsset={actionAsset}
            onActiveGroupChange={setActiveGroupId}
        />
    );
};
