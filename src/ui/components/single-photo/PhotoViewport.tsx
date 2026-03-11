import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, FC, MouseEvent, RefObject, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { usePanZoom } from '../../hooks/usePanZoom';
import { FaceOverlayMap } from './FaceOverlayMap';
import { ActionOverlays } from './ActionOverlays';
import { VariantFilmstrip } from './VariantFilmstrip';
export interface PanelState { showInfoPanel: boolean; setShowInfoPanel: (v: boolean) => void; activeInfoTab: 'file' | 'analysis' | 'people' | 'json'; setActiveInfoTab: (tab: 'file' | 'analysis' | 'people' | 'json') => void }
export interface AnalysisState { analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error'; setAnalysisState: Dispatch<SetStateAction<'idle' | 'analyzing' | 'cancelling' | 'error'>>; analysisError: string | null; setAnalysisError: Dispatch<SetStateAction<string | null>>; analyzingAssetId: string | null; setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>; setAnalyzingJobId: Dispatch<SetStateAction<string | null>> }
interface PhotoViewportProps { asset: Asset; assetsLength: number; currentIndex: number; showControls: boolean; setShowControls: Dispatch<SetStateAction<boolean>>; showFaces: boolean; setShowFaces: Dispatch<SetStateAction<boolean>>; showActionMenu: boolean; setShowActionMenu: Dispatch<SetStateAction<boolean>>; hoveredFaceKey: string | null; setHoveredFaceKey: Dispatch<SetStateAction<string | null>>; panelState: PanelState; onClose: () => void; onFaceClick?: (personId: string, personName: string) => void; onIsolateFace?: (assetId: string, faceIndex: number) => void; onSetSensitivity?: (assetId: string, status: string | null) => void; onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>; onOpenSettings?: () => void; onGetGroupOrbit?: (groupId: string) => Promise<Asset[]>; onSetCanonical?: (groupId: string, assetId: string) => Promise<void>; onExplodeGroup?: (groupId: string) => Promise<void>; onChangeIndex: (delta: -1 | 1) => void; analysis: AnalysisState; onRevealControls: () => void }

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

function useViewportGroupActions(onClose: () => void, onSetCanonical?: PhotoViewportProps['onSetCanonical'], onExplodeGroup?: PhotoViewportProps['onExplodeGroup']): GroupActionHandlers {
    const handleSetCanonical = useCallback(async (groupId: string, newCanonicalId: string) => {
        try {
            if (onSetCanonical) {await onSetCanonical(groupId, newCanonicalId);}
            onClose();
        } catch (e) {
            console.error('Failed to set canonical:', e);
        }
    }, [onClose, onSetCanonical]);

    const handleExplodeGroup = useCallback(async (groupId: string) => {
        try {
            if (onExplodeGroup) {await onExplodeGroup(groupId);}
            onClose();
        } catch (e) {
            console.error('Failed to explode group:', e);
        }
    }, [onClose, onExplodeGroup]);

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
                maxHeight: '100vh',
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
    onGetGroupOrbit?: (groupId: string) => Promise<Asset[]>;
    handleSetCanonical: (groupId: string, newCanonicalId: string) => Promise<void>;
    handleExplodeGroup: (groupId: string) => Promise<void>;
}> = ({ asset, onGetGroupOrbit, handleSetCanonical, handleExplodeGroup }) => {
    if (!(asset.group_id && asset.stack_count && asset.stack_count > 1 && onGetGroupOrbit)) {return null;}

    return (
        <VariantFilmstrip
            groupId={asset.group_id}
            canonicalAssetId={asset.id}
            onGetGroupOrbit={onGetGroupOrbit}
            onSetCanonical={handleSetCanonical}
            onExplodeGroup={handleExplodeGroup}
        />
    );
};

type PhotoViewportFrameProps = {
    containerRef: RefObject<HTMLDivElement | null>;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    asset: Asset;
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
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;
    analysis: AnalysisState;
    onGetGroupOrbit?: (groupId: string) => Promise<Asset[]>;
    handleSetCanonical: (groupId: string, newCanonicalId: string) => Promise<void>;
    handleExplodeGroup: (groupId: string) => Promise<void>;
    onRevealControls: () => void;
};

const frameStyle = { flex: 1, height: '100vh', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const;

const ViewportDecorations: FC<Pick<PhotoViewportFrameProps, 'asset' | 'assetsLength' | 'currentIndex' | 'showControls' | 'showActionMenu' | 'setShowActionMenu' | 'showFaces' | 'setShowFaces' | 'panelState' | 'scale' | 'setScale' | 'setPan' | 'resetPanZoom' | 'onClose' | 'onChangeIndex' | 'onSetSensitivity' | 'onExtractAiMetadata' | 'onOpenSettings' | 'analysis' | 'onGetGroupOrbit' | 'handleSetCanonical' | 'handleExplodeGroup'>> = ({
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
    onExtractAiMetadata,
    onOpenSettings,
    analysis,
    onGetGroupOrbit,
    handleSetCanonical,
    handleExplodeGroup,
}) => (
    <>
        <ViewportActions
            asset={asset}
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
            onExtractAiMetadata={onExtractAiMetadata}
            onOpenSettings={onOpenSettings}
            analysis={analysis}
        />

        <VariantFilmstripOverlay
            asset={asset}
            onGetGroupOrbit={onGetGroupOrbit}
            handleSetCanonical={handleSetCanonical}
            handleExplodeGroup={handleExplodeGroup}
        />
    </>
);

const PhotoViewportFrame: FC<PhotoViewportFrameProps> = ({
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
    onExtractAiMetadata,
    onOpenSettings,
    analysis,
    onGetGroupOrbit,
    handleSetCanonical,
    handleExplodeGroup,
    onRevealControls
}) => {
    const alwaysShowForPanel = panelState.showInfoPanel && panelState.activeInfoTab === 'people';
    const handleFrameClick = () => {
        setShowControls(!showControls);
        setShowActionMenu(false);
    };

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
                onExtractAiMetadata={onExtractAiMetadata}
                onOpenSettings={onOpenSettings}
                analysis={analysis}
                onGetGroupOrbit={onGetGroupOrbit}
                handleSetCanonical={handleSetCanonical}
                handleExplodeGroup={handleExplodeGroup}
            />
        </div>
    );
};

export const PhotoViewport: FC<PhotoViewportProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scale, setScale, pan, setPan, isDragging, handleMouseDown, resetPanZoom } = usePanZoom(containerRef);
    const imgSrc = resolveImageUrl(props.asset?.original_path || props.asset?.preview_path);
    const groupActions = useViewportGroupActions(props.onClose, props.onSetCanonical, props.onExplodeGroup);

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
            onExtractAiMetadata={props.onExtractAiMetadata}
            onOpenSettings={props.onOpenSettings}
            analysis={props.analysis}
            onGetGroupOrbit={props.onGetGroupOrbit}
            handleSetCanonical={groupActions.handleSetCanonical}
            handleExplodeGroup={groupActions.handleExplodeGroup}
            onRevealControls={props.onRevealControls}
        />
    );
};
