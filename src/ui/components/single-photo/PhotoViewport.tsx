import { useRef, useState, useEffect } from 'react';
import type { Dispatch, FC, MouseEvent, RefObject, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import { usePanZoom } from '../../hooks/usePanZoom';
import { ActionOverlays } from './ActionOverlays';
import { ZoomableStage } from './PhotoViewportStage';
import { useKeyboardNavigation } from './photoViewportInteractions';
import { usePhotoViewportImageState } from './usePhotoViewportImageState';
import { useViewportStageDimensions } from './useViewportStageDimensions';

export type PanelState = { showInfoPanel: boolean; setShowInfoPanel: (v: boolean) => void; activeInfoTab: InfoTab; setActiveInfoTab: (tab: InfoTab) => void }
export type AnalysisState = { analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error'; setAnalysisState: Dispatch<SetStateAction<'idle' | 'analyzing' | 'cancelling' | 'error'>>; analysisError: string | null; setAnalysisError: Dispatch<SetStateAction<string | null>>; analyzingAssetId: string | null; setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>; setAnalyzingJobId: Dispatch<SetStateAction<string | null>> }

type PhotoViewportProps = {
    readonly asset: Asset;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showControls: boolean;
    readonly setShowControls: Dispatch<SetStateAction<boolean>>;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly selectedOverlayKey: string | null;
    readonly setSelectedOverlayKey: Dispatch<SetStateAction<string | null>>;
    readonly panelState: PanelState;
    readonly onClose: () => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onOpenSettings?: () => void;
    readonly onSetCanonical?: (relationshipId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (relationshipId: string) => Promise<void>;
    readonly onChangeIndex: (delta: -1 | 1) => void;
    readonly analysis: AnalysisState;
    readonly onRevealControls: () => void;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[], parameters?: Record<string, unknown>) => void;
    readonly onEditPhoto?: () => void;
}

const frameStyle = { flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', userSelect: 'none' } as const;

function ViewportActions(props: {
    readonly asset: Asset;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showControls: boolean;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
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
    readonly onSetCanonical?: (relationshipId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (relationshipId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onOpenSettings?: () => void;
    readonly analysis: AnalysisState;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[], parameters?: Record<string, unknown>) => void;
    readonly onEditPhoto?: () => void;
    readonly hasFrame: boolean;
    readonly showWithFrame: boolean;
    readonly setShowWithFrame: (show: boolean) => void;
}) {
    return (
        <ActionOverlays
            asset={props.asset}
            assetsLength={props.assetsLength}
            currentIndex={props.currentIndex}
            showControls={props.showControls}
            showActionMenu={props.showActionMenu}
            setShowActionMenu={props.setShowActionMenu}
            isImageTransitionPending={props.isImageTransitionPending}
            showInfoPanel={props.panelState.showInfoPanel}
            setShowInfoPanel={props.panelState.setShowInfoPanel}
            scale={props.scale}
            setScale={props.setScale}
            setPan={props.setPan}
            resetPanZoom={props.resetPanZoom}
            onClose={props.onClose}
            onPrevious={() => props.onChangeIndex(-1)}
            onNext={() => props.onChangeIndex(1)}
            onSetSensitivity={props.onSetSensitivity}
            onMoveToBin={props.onMoveToBin}
            onRestoreFromBin={props.onRestoreFromBin}
            onSetCanonical={props.onSetCanonical}
            onExplodeGroup={props.onExplodeGroup}
            onExtractAiMetadata={props.onExtractAiMetadata}
            onRerunFaceDetection={props.onRerunFaceDetection}
            onOpenSettings={props.onOpenSettings}
            analysisState={props.analysis.analysisState}
            setAnalysisState={props.analysis.setAnalysisState}
            analysisError={props.analysis.analysisError}
            setAnalysisError={props.analysis.setAnalysisError}
            analyzingAssetId={props.analysis.analyzingAssetId}
            setAnalyzingAssetId={props.analysis.setAnalyzingAssetId}
            setAnalyzingJobId={props.analysis.setAnalyzingJobId}
            onRunWorkflowOnAssets={props.onRunWorkflowOnAssets}
            onEditPhoto={props.onEditPhoto}
            hasFrame={props.hasFrame}
            showWithFrame={props.showWithFrame}
            setShowWithFrame={props.setShowWithFrame}
        />
    );
}

function ViewportStageFrame(props: {
    readonly containerRef: RefObject<HTMLDivElement | null>;
    readonly showControls: boolean;
    readonly setShowControls: Dispatch<SetStateAction<boolean>>;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    readonly displayedAsset: Asset;
    readonly imgSrc: string | null;
    readonly pendingImageSrc: string | null;
    readonly stageSize: { width: number; height: number } | null;
    readonly pan: { x: number; y: number };
    readonly scale: number;
    readonly isDragging: boolean;
    readonly handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    readonly showFaceOverlays: boolean;
    readonly overlayMode: 'people' | 'objects' | null;
    readonly isImageTransitionPending: boolean;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly selectedOverlayKey: string | null;
    readonly setSelectedOverlayKey: Dispatch<SetStateAction<string | null>>;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly onRevealControls: () => void;
    readonly onActiveImageLoad: () => void;
    readonly onPendingImageLoad: () => void;
    readonly showWithFrame: boolean;
}) {
    return (
        <div
            ref={props.containerRef}
            style={frameStyle}
            onMouseMove={props.onRevealControls}
            onClick={() => {
                props.setShowControls(!props.showControls);
                props.setShowActionMenu(false);
            }}
        >
            <ZoomableStage
                asset={props.displayedAsset}
                imgSrc={props.imgSrc}
                pendingImageSrc={props.pendingImageSrc}
                stageSize={props.stageSize}
                pan={props.pan}
                scale={props.scale}
                isDragging={props.isDragging}
                showControls={props.showControls}
                setShowControls={props.setShowControls}
                setShowActionMenu={props.setShowActionMenu}
                handleMouseDown={props.handleMouseDown}
                overlayMode={props.overlayMode}
                overlaysReady={props.showFaceOverlays}
                isImageTransitionPending={props.isImageTransitionPending}
                hoveredFaceKey={props.hoveredFaceKey}
                setHoveredFaceKey={props.setHoveredFaceKey}
                selectedOverlayKey={props.selectedOverlayKey}
                setSelectedOverlayKey={props.setSelectedOverlayKey}
                onFaceClick={props.onFaceClick}
                onIsolateFace={props.onIsolateFace}
                onActiveImageLoad={props.onActiveImageLoad}
                onPendingImageLoad={props.onPendingImageLoad}
                showWithFrame={props.showWithFrame}
            />
        </div>
    );
}

type PhotoViewportContentProps = {
    readonly props: PhotoViewportProps;
    readonly containerRef: RefObject<HTMLDivElement | null>;
    readonly stageAsset: Asset;
    readonly stageImageSrc: string | null;
    readonly pendingImageSrc: string | null;
    readonly stageSize: { width: number; height: number } | null;
    readonly pan: { x: number; y: number };
    readonly scale: number;
    readonly setScale: Dispatch<SetStateAction<number>>;
    readonly setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    readonly isDragging: boolean;
    readonly handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    readonly resetPanZoom: () => void;
    readonly overlayMode: 'people' | 'objects' | null;
    readonly isImageTransitionPending: boolean;
    readonly showFaceOverlays: boolean;
    readonly markActiveImageReady: () => void;
    readonly commitPendingImage: () => void;
    readonly hasFrame: boolean;
    readonly showWithFrame: boolean;
    readonly setShowWithFrame: (show: boolean) => void;
};

function PhotoViewportContent(state: PhotoViewportContentProps) {
    const { props } = state;
    return (
        <>
            <ViewportStageFrame
                containerRef={state.containerRef}
                showControls={props.showControls}
                setShowControls={props.setShowControls}
                setShowActionMenu={props.setShowActionMenu}
                displayedAsset={state.stageAsset}
                imgSrc={state.stageImageSrc}
                pendingImageSrc={state.pendingImageSrc}
                stageSize={state.stageSize}
                pan={state.pan}
                scale={state.scale}
                isDragging={state.isDragging}
                handleMouseDown={state.handleMouseDown}
                showFaceOverlays={state.showFaceOverlays}
                overlayMode={state.overlayMode}
                isImageTransitionPending={state.isImageTransitionPending}
                hoveredFaceKey={props.hoveredFaceKey}
                setHoveredFaceKey={props.setHoveredFaceKey}
                selectedOverlayKey={props.selectedOverlayKey}
                setSelectedOverlayKey={props.setSelectedOverlayKey}
                onFaceClick={props.onFaceClick}
                onIsolateFace={props.onIsolateFace}
                onRevealControls={props.onRevealControls}
                onActiveImageLoad={state.markActiveImageReady}
                onPendingImageLoad={state.commitPendingImage}
                showWithFrame={state.showWithFrame}
            />
            <ViewportActions
                asset={props.asset}
                assetsLength={props.assetsLength}
                currentIndex={props.currentIndex}
                showControls={props.showControls}
                showActionMenu={props.showActionMenu}
                setShowActionMenu={props.setShowActionMenu}
                panelState={props.panelState}
                isImageTransitionPending={state.isImageTransitionPending}
                scale={state.scale}
                setScale={state.setScale}
                setPan={state.setPan}
                resetPanZoom={state.resetPanZoom}
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
                onRunWorkflowOnAssets={props.onRunWorkflowOnAssets}
                onEditPhoto={props.onEditPhoto}
                hasFrame={state.hasFrame}
                showWithFrame={state.showWithFrame}
                setShowWithFrame={state.setShowWithFrame}
            />
        </>
    );
}

export const PhotoViewport: FC<PhotoViewportProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scale, setScale, pan, setPan, isDragging, handleMouseDown, resetPanZoom } = usePanZoom(containerRef);
    const overlayMode = props.panelState.showInfoPanel && (props.panelState.activeInfoTab === 'people' || props.panelState.activeInfoTab === 'objects')
        ? props.panelState.activeInfoTab
        : null;
    const [showWithFrame, setShowWithFrame] = useState(true);

    useEffect(() => {
        setShowWithFrame(true);
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
        showOverlays: overlayMode !== null,
    });
    const stageSize = useViewportStageDimensions(containerRef, stageAsset);

    useKeyboardNavigation({
        assetsLength: props.assetsLength,
        onClose: props.onClose,
        resetPanZoom,
        showInfoPanel: props.panelState.showInfoPanel,
        setShowInfoPanel: props.panelState.setShowInfoPanel,
        onChangeIndex: props.onChangeIndex,
    });

    return (
        <PhotoViewportContent
            props={props}
            containerRef={containerRef}
            stageAsset={stageAsset}
            stageImageSrc={stageImageSrc}
            pendingImageSrc={pendingImageSrc}
            stageSize={stageSize}
            pan={pan}
            scale={scale}
            setScale={setScale}
            setPan={setPan}
            isDragging={isDragging}
            handleMouseDown={handleMouseDown}
            resetPanZoom={resetPanZoom}
            overlayMode={overlayMode}
            isImageTransitionPending={isImageTransitionPending}
            showFaceOverlays={showFaceOverlays}
            markActiveImageReady={markActiveImageReady}
            commitPendingImage={commitPendingImage}
            hasFrame={hasFrame}
            showWithFrame={showWithFrame}
            setShowWithFrame={setShowWithFrame}
        />
    );
};
