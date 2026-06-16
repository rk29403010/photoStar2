import { useRef, useState, useEffect } from 'react';
import type { Dispatch, FC, MouseEvent, RefObject, SetStateAction } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import { usePanZoom } from '../../hooks/usePanZoom';
import { ActionOverlays } from './ActionOverlays';
import { VariantFilmstripOverlay } from './PhotoViewportFilmstrip';
import { ZoomableStage } from './PhotoViewportStage';
import { applyActiveGroupContext, resolveActiveSinglePhotoGroupId } from './singlePhotoAssetModel';
import { useKeyboardNavigation, useViewportGroupActions } from './photoViewportInteractions';
import { usePhotoViewportImageState } from './usePhotoViewportImageState';
import { useViewportStageDimensions } from './useViewportStageDimensions';
export type PanelState = { showInfoPanel: boolean; setShowInfoPanel: (v: boolean) => void; activeInfoTab: InfoTab; setActiveInfoTab: (tab: InfoTab) => void }
export type AnalysisState = { analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error'; setAnalysisState: Dispatch<SetStateAction<'idle' | 'analyzing' | 'cancelling' | 'error'>>; analysisError: string | null; setAnalysisError: Dispatch<SetStateAction<string | null>>; analyzingAssetId: string | null; setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>; setAnalyzingJobId: Dispatch<SetStateAction<string | null>> }
type PhotoViewportProps = { readonly asset: Asset; readonly assetsLength: number; readonly currentIndex: number; readonly showControls: boolean; readonly setShowControls: Dispatch<SetStateAction<boolean>>; readonly showFaces: boolean; readonly setShowFaces: Dispatch<SetStateAction<boolean>>; readonly showActionMenu: boolean; readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>; readonly hoveredFaceKey: string | null; readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>; readonly panelState: PanelState; readonly onClose: () => void; readonly onFaceClick?: (personId: string, personName: string) => void; readonly onIsolateFace?: (assetId: string, faceIndex: number) => void; readonly onSetSensitivity?: (assetId: string, status: string | null) => void; readonly onMoveToBin?: (assetId: string) => Promise<void>; readonly onRestoreFromBin?: (assetId: string) => Promise<void>; readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>; readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>; readonly onOpenSettings?: () => void; readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>; readonly onOrbitLoaded: (assets: Asset[]) => void; readonly onSelectAsset: (assetId: string) => void; readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>; readonly onExplodeGroup?: (groupId: string) => Promise<void>; readonly onChangeIndex: (delta: -1 | 1) => void; readonly analysis: AnalysisState; readonly onRevealControls: () => void; readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void }
const ViewportActions: FC<{
    readonly asset: Asset;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showControls: boolean;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    readonly showFaces: boolean;
    readonly setShowFaces: Dispatch<SetStateAction<boolean>>;
    readonly panelState: PanelState;
    readonly isImageTransitionPending: boolean;
    readonly scale: number;
    readonly setScale: Dispatch<SetStateAction<number>>;
    readonly setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    readonly resetPanZoom: () => void;
    readonly onClose: () => void;
    readonly onChangeIndex: (delta: -1 | 1) => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onOpenSettings?: () => void;
    readonly analysis: AnalysisState;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
    readonly hasFrame: boolean;
    readonly showWithFrame: boolean;
    readonly setShowWithFrame: (show: boolean) => void;
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
    analysis,
    onRunWorkflowOnAssets,
    hasFrame,
    showWithFrame,
    setShowWithFrame
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
        onRunWorkflowOnAssets={onRunWorkflowOnAssets}
        hasFrame={hasFrame}
        showWithFrame={showWithFrame}
        setShowWithFrame={setShowWithFrame}
    />
    );
};

type PhotoViewportFrameProps = {
    readonly containerRef: RefObject<HTMLDivElement | null>;
    readonly showControls: boolean;
    readonly setShowControls: Dispatch<SetStateAction<boolean>>;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    readonly displayedAsset: Asset;
    readonly selectedAsset: Asset;
    readonly actionAsset: Asset;
    readonly imgSrc: string | null;
    readonly pendingImageSrc: string | null;
    readonly stageSize: { width: number; height: number } | null;
    readonly pan: { x: number; y: number };
    readonly scale: number;
    readonly isDragging: boolean;
    readonly handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    readonly showFaces: boolean;
    readonly showFaceOverlays: boolean;
    readonly isImageTransitionPending: boolean;
    readonly panelState: PanelState;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showActionMenu: boolean;
    readonly setShowFaces: Dispatch<SetStateAction<boolean>>;
    readonly setScale: Dispatch<SetStateAction<number>>;
    readonly setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    readonly resetPanZoom: () => void;
    readonly onClose: () => void;
    readonly onChangeIndex: (delta: -1 | 1) => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onOpenSettings?: () => void;
    readonly analysis: AnalysisState;
    readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onOrbitLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onActiveGroupChange: (groupId: string) => void;
    readonly onRevealControls: () => void;
    readonly onActiveImageLoad: () => void;
    readonly onPendingImageLoad: () => void;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
    readonly hasFrame: boolean;
    readonly showWithFrame: boolean;
    readonly setShowWithFrame: (show: boolean) => void;
};

const frameStyle = { flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', userSelect: 'none' } as const;

const ViewportStageFrame: FC<Pick<PhotoViewportFrameProps, 'containerRef' | 'showControls' | 'setShowControls' | 'setShowActionMenu' | 'displayedAsset' | 'imgSrc' | 'pendingImageSrc' | 'stageSize' | 'pan' | 'scale' | 'isDragging' | 'handleMouseDown' | 'showFaces' | 'showFaceOverlays' | 'isImageTransitionPending' | 'panelState' | 'hoveredFaceKey' | 'setHoveredFaceKey' | 'onFaceClick' | 'onIsolateFace' | 'onRevealControls' | 'onActiveImageLoad' | 'onPendingImageLoad' | 'showWithFrame'>> = ({
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
    showWithFrame,
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
                showWithFrame={showWithFrame}
            />
        </div>
    );
};

const ViewportDecorations: FC<Pick<PhotoViewportFrameProps, 'selectedAsset' | 'assetsLength' | 'currentIndex' | 'showControls' | 'showActionMenu' | 'setShowActionMenu' | 'showFaces' | 'setShowFaces' | 'panelState' | 'isImageTransitionPending' | 'scale' | 'setScale' | 'setPan' | 'resetPanZoom' | 'onClose' | 'onChangeIndex' | 'onSetSensitivity' | 'onMoveToBin' | 'onRestoreFromBin' | 'onSetCanonical' | 'onExplodeGroup' | 'onExtractAiMetadata' | 'onRerunFaceDetection' | 'onOpenSettings' | 'analysis' | 'onGetGroupOrbit' | 'onOrbitLoaded' | 'onSelectAsset' | 'onRunWorkflowOnAssets' | 'hasFrame' | 'showWithFrame' | 'setShowWithFrame'> & { readonly actionAsset: Asset; readonly onActiveGroupChange: (groupId: string) => void }> = ({
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
    onRunWorkflowOnAssets,
    hasFrame,
    showWithFrame,
    setShowWithFrame
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
            onRunWorkflowOnAssets={onRunWorkflowOnAssets}
            hasFrame={hasFrame}
            showWithFrame={showWithFrame}
            setShowWithFrame={setShowWithFrame}
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
                showWithFrame={props.showWithFrame}
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
                onRunWorkflowOnAssets={props.onRunWorkflowOnAssets}
                hasFrame={props.hasFrame}
                showWithFrame={props.showWithFrame}
                setShowWithFrame={props.setShowWithFrame}
            />
        </>
    );
};

// eslint-disable-next-line max-lines-per-function -- Cohesive orchestration of hooks, refs, and transitions for photo view
export const PhotoViewport: FC<PhotoViewportProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scale, setScale, pan, setPan, isDragging, handleMouseDown, resetPanZoom } = usePanZoom(containerRef);
    const groupActions = useViewportGroupActions(props.onSetCanonical, props.onExplodeGroup);
    const [requestedActiveGroupId, setRequestedActiveGroupId] = useState<string | null>(null);
    const activeGroupId = resolveActiveSinglePhotoGroupId(props.asset, requestedActiveGroupId);
    const actionAsset = applyActiveGroupContext(props.asset, activeGroupId);
    const alwaysShowForPanel = props.panelState.showInfoPanel && props.panelState.activeInfoTab === 'people';
    const [showWithFrame, setShowWithFrame] = useState(false);

    useEffect(() => {
        setShowWithFrame(false);
    }, [props.asset.id]);

    const hasFrame = Boolean(props.asset.frame_detection);

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
            {...props}
            containerRef={containerRef}
            displayedAsset={stageAsset}
            selectedAsset={props.asset}
            imgSrc={stageImageSrc}
            pendingImageSrc={pendingImageSrc}
            stageSize={stageSize}
            pan={pan}
            scale={scale}
            isDragging={isDragging}
            handleMouseDown={handleMouseDown}
            showFaceOverlays={showFaceOverlays}
            isImageTransitionPending={isImageTransitionPending}
            onSetCanonical={groupActions.handleSetCanonical}
            onExplodeGroup={groupActions.handleExplodeGroup}
            onActiveImageLoad={markActiveImageReady}
            onPendingImageLoad={commitPendingImage}
            actionAsset={actionAsset}
            onActiveGroupChange={setRequestedActiveGroupId}
            hasFrame={hasFrame}
            showWithFrame={showWithFrame}
            setShowWithFrame={setShowWithFrame}
            setScale={setScale}
            setPan={setPan}
            resetPanZoom={resetPanZoom}
        />
    );
};
