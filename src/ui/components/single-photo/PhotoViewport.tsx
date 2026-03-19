import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, FC, MouseEvent, RefObject, SetStateAction } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { usePanZoom } from '../../hooks/usePanZoom';
import { FaceOverlayMap } from './FaceOverlayMap';
import { ActionOverlays } from './ActionOverlays';
import { VariantFilmstrip } from './VariantFilmstrip';
import { shouldShowVariantFilmstrip } from './variantFilmstripModel';
import { applyActiveGroupContext } from './singlePhotoAssetModel';
export interface PanelState { showInfoPanel: boolean; setShowInfoPanel: (v: boolean) => void; activeInfoTab: 'file' | 'analysis' | 'people' | 'json'; setActiveInfoTab: (tab: 'file' | 'analysis' | 'people' | 'json') => void }
export interface AnalysisState { analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error'; setAnalysisState: Dispatch<SetStateAction<'idle' | 'analyzing' | 'cancelling' | 'error'>>; analysisError: string | null; setAnalysisError: Dispatch<SetStateAction<string | null>>; analyzingAssetId: string | null; setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>; setAnalyzingJobId: Dispatch<SetStateAction<string | null>> }
interface PhotoViewportProps { asset: Asset; assetsLength: number; currentIndex: number; showControls: boolean; setShowControls: Dispatch<SetStateAction<boolean>>; showFaces: boolean; setShowFaces: Dispatch<SetStateAction<boolean>>; showActionMenu: boolean; setShowActionMenu: Dispatch<SetStateAction<boolean>>; hoveredFaceKey: string | null; setHoveredFaceKey: Dispatch<SetStateAction<string | null>>; panelState: PanelState; onClose: () => void; onFaceClick?: (personId: string, personName: string) => void; onIsolateFace?: (assetId: string, faceIndex: number) => void; onSetSensitivity?: (assetId: string, status: string | null) => void; onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>; onOpenSettings?: () => void; onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>; onOrbitLoaded: (assets: Asset[]) => void; onSelectAsset: (assetId: string) => void; onSetCanonical?: (groupId: string, assetId: string) => Promise<void>; onExplodeGroup?: (groupId: string) => Promise<void>; onChangeIndex: (delta: -1 | 1) => void; analysis: AnalysisState; onRevealControls: () => void }

type GroupActionHandlers = {
    handleSetCanonical: (groupId: string, newCanonicalId: string) => Promise<void>;
    handleExplodeGroup: (groupId: string) => Promise<void>;
};

function useKeyboardNavigation(params: {
    assetsLength: number;
    onClose: () => void;
    resetPanZoom: () => void;
    showInfoPanel: boolean;
    setShowInfoPanel: (v: boolean) => void;
    onChangeIndex: (delta: -1 | 1) => void;
}) {
    const { assetsLength, onClose, resetPanZoom, showInfoPanel, setShowInfoPanel, onChangeIndex } = params;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key === 'ArrowRight') {
                onChangeIndex(1);
                resetPanZoom();
                return;
            }
            if (e.key === 'ArrowLeft') {
                onChangeIndex(-1);
                resetPanZoom();
                return;
            }
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                resetPanZoom();
                return;
            }
            if (e.key === 'i' || e.key === 'I') {
                setShowInfoPanel(!showInfoPanel);
            }
        };

        if (assetsLength > 0) {window.addEventListener('keydown', handleKeyDown);}
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [assetsLength, onClose, onChangeIndex, resetPanZoom, setShowInfoPanel, showInfoPanel]);
}

function useViewportGroupActions(onSetCanonical?: PhotoViewportProps['onSetCanonical'], onExplodeGroup?: PhotoViewportProps['onExplodeGroup']): GroupActionHandlers {
    const handleSetCanonical = useCallback(async (groupId: string, newCanonicalId: string) => {
        try {
            if (onSetCanonical) {await onSetCanonical(groupId, newCanonicalId);}
        } catch (e) {
            console.error('Failed to set canonical:', e);
        }
    }, [onSetCanonical]);

    const handleExplodeGroup = useCallback(async (groupId: string) => {
        try {
            if (onExplodeGroup) {await onExplodeGroup(groupId);}
        } catch (e) {
            console.error('Failed to explode group:', e);
        }
    }, [onExplodeGroup]);

    return { handleSetCanonical, handleExplodeGroup };
}

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
            <FaceOverlayMap
                asset={asset}
                showFaces={showFaces}
                alwaysShowForPanel={alwaysShowForPanel}
                hoveredFaceKey={hoveredFaceKey}
                onHoverFaceKey={setHoveredFaceKey}
                onFaceClick={onFaceClick}
                onIsolateFace={onIsolateFace}
            />
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
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
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

const VariantFilmstripOverlay: FC<{
    asset: Asset;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
    onActiveGroupChange: (groupId: string) => void;
}> = ({ asset, onGetGroupOrbit, onOrbitLoaded, onSelectAsset, onActiveGroupChange }) => {
    if (!shouldShowVariantFilmstrip({ groupId: asset.group_id, hasOrbitLoader: Boolean(onGetGroupOrbit) })) {return null;}

    return (
        <VariantFilmstrip
            groupId={asset.group_id!}
            selectedAsset={asset}
            onGetGroupOrbit={onGetGroupOrbit!}
            onOrbitLoaded={onOrbitLoaded}
            onSelectAsset={onSelectAsset}
            onActiveGroupChange={onActiveGroupChange}
        />
    );
};

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
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;
    analysis: AnalysisState;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
    onActiveGroupChange: (groupId: string) => void;
    onRevealControls: () => void;
};

const frameStyle = { flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const;

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

function buildFrameClickHandler(
    showControls: boolean,
    setShowControls: Dispatch<SetStateAction<boolean>>,
    setShowActionMenu: Dispatch<SetStateAction<boolean>>
) {
    return () => {
        setShowControls(!showControls);
        setShowActionMenu(false);
    };
}

const PhotoViewportFrame: FC<PhotoViewportFrameProps> = ({
    containerRef,
    showControls,
    setShowControls,
    setShowActionMenu,
    asset,
    actionAsset,
    imgSrc,
    pan,
    scale,
    isDragging,
    handleMouseDown,
    showFaces,
    panelState,
    hoveredFaceKey,
    setHoveredFaceKey,
    onFaceClick,
    onIsolateFace,
    assetsLength,
    currentIndex,
    showActionMenu,
    setShowFaces,
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
    onRevealControls
}) => {
    const alwaysShowForPanel = panelState.showInfoPanel && panelState.activeInfoTab === 'people';
    const handleFrameClick = buildFrameClickHandler(showControls, setShowControls, setShowActionMenu);
    return (
        <div ref={containerRef} style={frameStyle} onMouseMove={onRevealControls} onClick={handleFrameClick}>
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
                hoveredFaceKey={hoveredFaceKey}
                setHoveredFaceKey={setHoveredFaceKey}
                onFaceClick={onFaceClick}
                onIsolateFace={onIsolateFace}
            />
            <ViewportDecorations
                asset={asset}
                actionAsset={actionAsset}
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
                onGetGroupOrbit={onGetGroupOrbit}
                onOrbitLoaded={onOrbitLoaded} onSelectAsset={onSelectAsset}
                onActiveGroupChange={onActiveGroupChange}
            />
        </div>
    );
};

export const PhotoViewport: FC<PhotoViewportProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scale, setScale, pan, setPan, isDragging, handleMouseDown, resetPanZoom } = usePanZoom(containerRef);
    const imgSrc = resolveImageUrl(props.asset?.original_path || props.asset?.preview_path);
    const groupActions = useViewportGroupActions(props.onSetCanonical, props.onExplodeGroup);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(props.asset.group_id ?? null);
    const actionAsset = applyActiveGroupContext(props.asset, activeGroupId);

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
            asset={props.asset}
            imgSrc={imgSrc}
            pan={pan}
            scale={scale}
            isDragging={isDragging}
            handleMouseDown={handleMouseDown}
            showFaces={props.showFaces}
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
