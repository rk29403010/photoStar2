import { useRef, useState } from 'react';
import type { Dispatch, FC, MouseEvent, RefObject, SetStateAction } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import { usePanZoom } from '../../hooks/usePanZoom';
import { ActionOverlays } from './ActionOverlays';
import { VariantFilmstripOverlay } from './PhotoViewportFilmstrip';
import { ZoomableStage } from './PhotoViewportStage';
import { applyActiveGroupContext, resolveActiveSinglePhotoGroupId } from './singlePhotoAssetModel';
import { useKeyboardNavigation, useViewportGroupActions } from './photoViewportInteractions';
import { usePhotoViewportImageState } from './usePhotoViewportImageState';
import { useViewportStageDimensions } from './useViewportStageDimensions';
export interface PanelState { showInfoPanel: boolean; setShowInfoPanel: (v: boolean) => void; activeInfoTab: 'file' | 'analysis' | 'people' | 'json'; setActiveInfoTab: (tab: 'file' | 'analysis' | 'people' | 'json') => void }
export interface AnalysisState { analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error'; setAnalysisState: Dispatch<SetStateAction<'idle' | 'analyzing' | 'cancelling' | 'error'>>; analysisError: string | null; setAnalysisError: Dispatch<SetStateAction<string | null>>; analyzingAssetId: string | null; setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>; setAnalyzingJobId: Dispatch<SetStateAction<string | null>> }
interface PhotoViewportProps { asset: Asset; assetsLength: number; currentIndex: number; showControls: boolean; setShowControls: Dispatch<SetStateAction<boolean>>; showFaces: boolean; setShowFaces: Dispatch<SetStateAction<boolean>>; showActionMenu: boolean; setShowActionMenu: Dispatch<SetStateAction<boolean>>; hoveredFaceKey: string | null; setHoveredFaceKey: Dispatch<SetStateAction<string | null>>; panelState: PanelState; onClose: () => void; onFaceClick?: (personId: string, personName: string) => void; onIsolateFace?: (assetId: string, faceIndex: number) => void; onSetSensitivity?: (assetId: string, status: string | null) => void; onMoveToBin?: (assetId: string) => Promise<void>; onRestoreFromBin?: (assetId: string) => Promise<void>; onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>; onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>; onOpenSettings?: () => void; onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>; onOrbitLoaded: (assets: Asset[]) => void; onSelectAsset: (assetId: string) => void; onSetCanonical?: (groupId: string, assetId: string) => Promise<void>; onExplodeGroup?: (groupId: string) => Promise<void>; onChangeIndex: (delta: -1 | 1) => void; analysis: AnalysisState; onRevealControls: () => void }

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
    isImageTransitionPending: boolean;
    scale: number;
    setScale: Dispatch<SetStateAction<number>>;
    setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    resetPanZoom: () => void;
    onClose: () => void;
    onChangeIndex: (delta: -1 | 1) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onMoveToBin?: (assetId: string) => Promise<void>;
    onRestoreFromBin?: (assetId: string) => Promise<void>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
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
    isImageTransitionPending,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onChangeIndex,
    onSetSensitivity,
    onMoveToBin,
    onRestoreFromBin,
    onSetCanonical,
    onExplodeGroup,
    onExtractAiMetadata,
    onRerunFaceDetection,
    onOpenSettings,
    analysis
}) => {
    return (
    <ActionOverlays
        asset={asset}
        assetsLength={assetsLength}
        currentIndex={currentIndex}
        showControls={showControls}
        showActionMenu={showActionMenu}
        setShowActionMenu={setShowActionMenu}
        showFaces={showFaces}
        setShowFaces={setShowFaces}
        isImageTransitionPending={isImageTransitionPending}
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
        onMoveToBin={onMoveToBin}
        onRestoreFromBin={onRestoreFromBin}
        onSetCanonical={onSetCanonical}
        onExplodeGroup={onExplodeGroup}
        onExtractAiMetadata={onExtractAiMetadata}
        onRerunFaceDetection={onRerunFaceDetection}
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
};

type PhotoViewportFrameProps = {
    containerRef: RefObject<HTMLDivElement | null>;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    displayedAsset: Asset;
    selectedAsset: Asset;
    actionAsset: Asset;
    imgSrc: string | null;
    pendingImageSrc: string | null;
    stageSize: { width: number; height: number } | null;
    pan: { x: number; y: number };
    scale: number;
    isDragging: boolean;
    handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    showFaces: boolean;
    showFaceOverlays: boolean;
    isImageTransitionPending: boolean;
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
    onMoveToBin?: (assetId: string) => Promise<void>;
    onRestoreFromBin?: (assetId: string) => Promise<void>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;
    analysis: AnalysisState;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
    onActiveGroupChange: (groupId: string) => void;
    onRevealControls: () => void;
    onActiveImageLoad: () => void;
    onPendingImageLoad: () => void;
};

const frameStyle = { flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', userSelect: 'none' } as const;

const ViewportStageFrame: FC<Pick<PhotoViewportFrameProps, 'containerRef' | 'showControls' | 'setShowControls' | 'setShowActionMenu' | 'displayedAsset' | 'imgSrc' | 'pendingImageSrc' | 'stageSize' | 'pan' | 'scale' | 'isDragging' | 'handleMouseDown' | 'showFaces' | 'showFaceOverlays' | 'isImageTransitionPending' | 'panelState' | 'hoveredFaceKey' | 'setHoveredFaceKey' | 'onFaceClick' | 'onIsolateFace' | 'onRevealControls' | 'onActiveImageLoad' | 'onPendingImageLoad'>> = ({
    containerRef,
    showControls,
    setShowControls,
    setShowActionMenu,
    displayedAsset,
    imgSrc,
    pendingImageSrc,
    stageSize,
    pan,
    scale,
    isDragging,
    handleMouseDown,
    showFaces,
    showFaceOverlays,
    isImageTransitionPending,
    panelState,
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace,
    onRevealControls,
    onActiveImageLoad,
    onPendingImageLoad,
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
                asset={displayedAsset}
                imgSrc={imgSrc}
                pendingImageSrc={pendingImageSrc}
                stageSize={stageSize}
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
                isImageTransitionPending={isImageTransitionPending}
                hoveredFaceKey={hoveredFaceKey}
                setHoveredFaceKey={setHoveredFaceKey}
                onFaceClick={onFaceClick}
                onIsolateFace={onIsolateFace}
                onActiveImageLoad={onActiveImageLoad}
                onPendingImageLoad={onPendingImageLoad}
            />
        </div>
    );
};

const ViewportDecorations: FC<Pick<PhotoViewportFrameProps, 'selectedAsset' | 'assetsLength' | 'currentIndex' | 'showControls' | 'showActionMenu' | 'setShowActionMenu' | 'showFaces' | 'setShowFaces' | 'panelState' | 'isImageTransitionPending' | 'scale' | 'setScale' | 'setPan' | 'resetPanZoom' | 'onClose' | 'onChangeIndex' | 'onSetSensitivity' | 'onMoveToBin' | 'onRestoreFromBin' | 'onSetCanonical' | 'onExplodeGroup' | 'onExtractAiMetadata' | 'onRerunFaceDetection' | 'onOpenSettings' | 'analysis' | 'onGetGroupOrbit' | 'onOrbitLoaded' | 'onSelectAsset'> & { actionAsset: Asset; onActiveGroupChange: (groupId: string) => void }> = ({
    selectedAsset,
    actionAsset,
    assetsLength,
    currentIndex,
    showControls,
    showActionMenu,
    setShowActionMenu,
    showFaces,
    setShowFaces,
    panelState,
    isImageTransitionPending,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onChangeIndex,
    onSetSensitivity,
    onMoveToBin,
    onRestoreFromBin,
    onSetCanonical,
    onExplodeGroup,
    onExtractAiMetadata,
    onRerunFaceDetection,
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
            isImageTransitionPending={isImageTransitionPending}
            scale={scale}
            setScale={setScale}
            setPan={setPan}
            resetPanZoom={resetPanZoom}
            onClose={onClose}
            onChangeIndex={onChangeIndex}
            onSetSensitivity={onSetSensitivity}
            onMoveToBin={onMoveToBin}
            onRestoreFromBin={onRestoreFromBin}
            onSetCanonical={onSetCanonical}
            onExplodeGroup={onExplodeGroup}
            onExtractAiMetadata={onExtractAiMetadata}
            onRerunFaceDetection={onRerunFaceDetection}
            onOpenSettings={onOpenSettings}
            analysis={analysis}
        />

        <VariantFilmstripOverlay
            asset={selectedAsset}
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
                displayedAsset={props.displayedAsset}
                imgSrc={props.imgSrc}
                pendingImageSrc={props.pendingImageSrc}
                stageSize={props.stageSize}
                pan={props.pan}
                scale={props.scale}
                isDragging={props.isDragging}
                handleMouseDown={props.handleMouseDown}
                showFaces={props.showFaces}
                showFaceOverlays={props.showFaceOverlays}
                isImageTransitionPending={props.isImageTransitionPending}
                panelState={props.panelState}
                hoveredFaceKey={props.hoveredFaceKey}
                setHoveredFaceKey={props.setHoveredFaceKey}
                onFaceClick={props.onFaceClick}
                onIsolateFace={props.onIsolateFace}
                onRevealControls={props.onRevealControls}
                onActiveImageLoad={props.onActiveImageLoad}
                onPendingImageLoad={props.onPendingImageLoad}
            />
            <ViewportDecorations
                selectedAsset={props.selectedAsset}
                actionAsset={props.actionAsset}
                assetsLength={props.assetsLength}
                currentIndex={props.currentIndex}
                showControls={props.showControls}
                showActionMenu={props.showActionMenu}
                setShowActionMenu={props.setShowActionMenu}
                showFaces={props.showFaces}
                setShowFaces={props.setShowFaces}
                panelState={props.panelState}
                isImageTransitionPending={props.isImageTransitionPending}
                scale={props.scale}
                setScale={props.setScale}
                setPan={props.setPan}
                resetPanZoom={props.resetPanZoom}
                onClose={props.onClose}
                onChangeIndex={props.onChangeIndex}
                onSetSensitivity={props.onSetSensitivity}
                onMoveToBin={props.onMoveToBin}
                onRestoreFromBin={props.onRestoreFromBin}
                onSetCanonical={props.onSetCanonical}
                onExplodeGroup={props.onExplodeGroup}
                onExtractAiMetadata={props.onExtractAiMetadata}
                onRerunFaceDetection={props.onRerunFaceDetection}
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
    const [requestedActiveGroupId, setRequestedActiveGroupId] = useState<string | null>(null);
    const activeGroupId = resolveActiveSinglePhotoGroupId(props.asset, requestedActiveGroupId);
    const actionAsset = applyActiveGroupContext(props.asset, activeGroupId);
    const alwaysShowForPanel = props.panelState.showInfoPanel && props.panelState.activeInfoTab === 'people';
    const {
        stageAsset,
        stageImageSrc,
        pendingImageSrc,
        isImageTransitionPending,
        showFaceOverlays,
        commitPendingImage,
        markActiveImageReady,
    } = usePhotoViewportImageState({
        asset: props.asset,
        showFaces: props.showFaces,
        alwaysShowForPanel,
    });
    const stageSize = useViewportStageDimensions(containerRef, stageAsset);

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
            displayedAsset={stageAsset}
            selectedAsset={props.asset}
            imgSrc={stageImageSrc}
            pendingImageSrc={pendingImageSrc}
            stageSize={stageSize}
            pan={pan}
            scale={scale}
            isDragging={isDragging}
            handleMouseDown={handleMouseDown}
            showFaces={props.showFaces}
            showFaceOverlays={showFaceOverlays}
            isImageTransitionPending={isImageTransitionPending}
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
            onMoveToBin={props.onMoveToBin}
            onRestoreFromBin={props.onRestoreFromBin}
            onSetCanonical={groupActions.handleSetCanonical}
            onExplodeGroup={groupActions.handleExplodeGroup}
            onExtractAiMetadata={props.onExtractAiMetadata}
            onRerunFaceDetection={props.onRerunFaceDetection}
            onOpenSettings={props.onOpenSettings}
            analysis={props.analysis}
            onGetGroupOrbit={props.onGetGroupOrbit}
            onOrbitLoaded={props.onOrbitLoaded}
            onSelectAsset={props.onSelectAsset}
            onRevealControls={props.onRevealControls}
            onActiveImageLoad={markActiveImageReady}
            onPendingImageLoad={commitPendingImage}
            actionAsset={actionAsset}
            onActiveGroupChange={setRequestedActiveGroupId}
        />
    );
};
