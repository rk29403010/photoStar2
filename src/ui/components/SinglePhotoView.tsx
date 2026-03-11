import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, FC, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import type { BackgroundJob } from '@contracts/jobs';
import { InfoPanel } from './single-photo/InfoPanel';
import { PhotoViewport } from './single-photo/PhotoViewport';
import type { PanelState, AnalysisState } from './single-photo/PhotoViewport';

interface SinglePhotoViewProps {
    assets: Asset[];
    initialIndex: number;
    onClose: () => void;
    onPrioritize: (mediaId: string) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onGetGroupOrbit?: (groupId: string) => Promise<Asset[]>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onOpenSettings?: () => void;
    jobs?: BackgroundJob[];
    showInfoPanel?: boolean;
    onShowInfoPanelChange?: (v: boolean) => void;
    activeInfoTab?: 'file' | 'analysis' | 'people' | 'json';
    onActiveInfoTabChange?: (t: 'file' | 'analysis' | 'people' | 'json') => void;
}

interface SinglePhotoOverlayProps {
    asset: Asset;
    assets: Asset[];
    currentIndex: number;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    showFaces: boolean;
    setShowFaces: Dispatch<SetStateAction<boolean>>;
    showActionMenu: boolean;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    panelState: PanelState;
    onClose: () => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;
    onGetGroupOrbit?: (groupId: string) => Promise<Asset[]>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onChangeIndex: (delta: -1 | 1) => void;
    onRevealControls: () => void;
    analysis: AnalysisState;
}

type AnalysisUiState = 'idle' | 'analyzing' | 'cancelling' | 'error';
type AnalysisUiBundle = {
    analysisState: AnalysisUiState;
    setAnalysisState: Dispatch<SetStateAction<AnalysisUiState>>;
    analysisError: string | null;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    analyzingAssetId: string | null;
    setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>;
    analyzingJobId: string | null;
    setAnalyzingJobId: Dispatch<SetStateAction<string | null>>;
};
type ControlsState = {
    currentIndex: number;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    showFaces: boolean;
    setShowFaces: Dispatch<SetStateAction<boolean>>;
    showActionMenu: boolean;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    revealControls: () => void;
    onChangeIndex: (delta: -1 | 1) => void;
};

const INFO_PANEL_WIDTH = 360;
const CONTROLS_IDLE_MS = 2500;

function usePanelState({
    showInfoPanel: showInfoPanelProp,
    onShowInfoPanelChange,
    activeInfoTab: activeInfoTabProp,
    onActiveInfoTabChange
}: Pick<SinglePhotoViewProps, 'showInfoPanel' | 'onShowInfoPanelChange' | 'activeInfoTab' | 'onActiveInfoTabChange'>): PanelState & { setActiveInfoTab: (t: 'file' | 'analysis' | 'people' | 'json') => void } {
    const [showInfoPanelInternal, setShowInfoPanelInternal] = useState(false);
    const showInfoPanel = showInfoPanelProp ?? showInfoPanelInternal;

    const setShowInfoPanel = useCallback((value: boolean) => {
        setShowInfoPanelInternal(value);
        onShowInfoPanelChange?.(value);
    }, [onShowInfoPanelChange]);

    const [activeInfoTabInternal, setActiveInfoTabInternal] = useState<'file' | 'analysis' | 'people' | 'json'>('file');
    const activeInfoTab = activeInfoTabProp ?? activeInfoTabInternal;

    const setActiveInfoTab = useCallback((tab: 'file' | 'analysis' | 'people' | 'json') => {
        setActiveInfoTabInternal(tab);
        onActiveInfoTabChange?.(tab);
    }, [onActiveInfoTabChange]);

    return { showInfoPanel, setShowInfoPanel, activeInfoTab, setActiveInfoTab };
}

function useSinglePhotoControls(initialIndex: number, assetsLength: number): ControlsState {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [showControls, setShowControls] = useState(true);
    const [showFaces, setShowFaces] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [hoveredFaceKey, setHoveredFaceKey] = useState<string | null>(null);
    const controlsHideTimerRef = useRef<number | null>(null);

    const clearControlsHideTimer = useCallback(() => {
        if (controlsHideTimerRef.current !== null) {
            window.clearTimeout(controlsHideTimerRef.current);
            controlsHideTimerRef.current = null;
        }
    }, []);

    const scheduleControlsHide = useCallback(() => {
        clearControlsHideTimer();
        controlsHideTimerRef.current = window.setTimeout(() => {
            setShowControls(false);
        }, CONTROLS_IDLE_MS);
    }, [clearControlsHideTimer]);

    const revealControls = useCallback(() => {
        setShowControls(true);
        if (!showActionMenu) {
            scheduleControlsHide();
        }
    }, [scheduleControlsHide, showActionMenu]);

    const onChangeIndex = useCallback((delta: -1 | 1) => {
        setCurrentIndex((prev) => {
            const next = prev + delta;
            if (next < 0 || next >= assetsLength) {return prev;}
            return next;
        });
    }, [assetsLength]);

    useEffect(() => {
        setCurrentIndex(initialIndex);
    }, [initialIndex]);

    useEffect(() => {
        revealControls();
    }, [currentIndex, revealControls]);

    useEffect(() => {
        if (showActionMenu) {
            clearControlsHideTimer();
            setShowControls(true);
            return;
        }

        if (showControls) {
            scheduleControlsHide();
        }
    }, [clearControlsHideTimer, scheduleControlsHide, showActionMenu, showControls]);

    useEffect(() => {
        return () => {
            clearControlsHideTimer();
        };
    }, [clearControlsHideTimer]);

    return {
        currentIndex,
        showControls,
        setShowControls,
        showFaces,
        setShowFaces,
        showActionMenu,
        setShowActionMenu,
        hoveredFaceKey,
        setHoveredFaceKey,
        revealControls,
        onChangeIndex
    };
}

function useAnalysisUiState(): AnalysisUiBundle {
    const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
    const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
    const [analysisState, setAnalysisState] = useState<AnalysisUiState>('idle');
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    return {
        analysisState,
        setAnalysisState,
        analysisError,
        setAnalysisError,
        analyzingAssetId,
        setAnalyzingAssetId,
        analyzingJobId,
        setAnalyzingJobId
    };
}

function useAnalysisTracking(params: {
    jobs?: BackgroundJob[];
    analyzingJobId: string | null;
    assetAiMetadata: Asset['ai_metadata'] | undefined;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    setAnalysisState: Dispatch<SetStateAction<AnalysisUiState>>;
    setAnalyzingJobId: Dispatch<SetStateAction<string | null>>;
    setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>;
    setShowInfoPanel: (v: boolean) => void;
}) {
    const {
        jobs,
        analyzingJobId,
        assetAiMetadata,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
        setShowInfoPanel
    } = params;

    useEffect(() => {
        if (!analyzingJobId || !jobs) {return;}

        const job = jobs.find((candidate) => candidate.id === analyzingJobId);
        if (!job) {return;}

        if (job.state === 'failed') {
            setTimeout(() => {
                const message = job.issues && job.issues.length > 0 ? job.issues[0].message : 'Analysis failed';
                setAnalysisError(message);
                setAnalysisState('error');
                setAnalyzingJobId(null);
            }, 0);
            return;
        }

        if (job.state === 'completed' && assetAiMetadata) {
            setTimeout(() => {
                setAnalysisState('idle');
                setAnalyzingAssetId(null);
                setAnalyzingJobId(null);
                setShowInfoPanel(true);
            }, 0);
        }
    }, [
        jobs,
        analyzingJobId,
        assetAiMetadata,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
        setShowInfoPanel
    ]);
}

function useAssetPrioritization(assetId: string | undefined, onPrioritize: (mediaId: string) => void) {
    const lastPrioritizedAssetIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!assetId) {return;}
        if (lastPrioritizedAssetIdRef.current === assetId) {return;}
        lastPrioritizedAssetIdRef.current = assetId;
        onPrioritize(assetId);
    }, [assetId, onPrioritize]);
}

function buildAnalysisState(bundle: AnalysisUiBundle): AnalysisState {
    return {
        analysisState: bundle.analysisState,
        setAnalysisState: bundle.setAnalysisState,
        analysisError: bundle.analysisError,
        setAnalysisError: bundle.setAnalysisError,
        analyzingAssetId: bundle.analyzingAssetId,
        setAnalyzingAssetId: bundle.setAnalyzingAssetId,
        setAnalyzingJobId: bundle.setAnalyzingJobId
    };
}

const SinglePhotoOverlay: FC<SinglePhotoOverlayProps> = ({
    asset,
    assets,
    currentIndex,
    showControls,
    setShowControls,
    showFaces,
    setShowFaces,
    showActionMenu,
    setShowActionMenu,
    hoveredFaceKey,
    setHoveredFaceKey,
    panelState,
    onClose,
    onFaceClick,
    onIsolateFace,
    onSetSensitivity,
    onExtractAiMetadata,
    onOpenSettings,
    onGetGroupOrbit,
    onSetCanonical,
    onExplodeGroup,
    onChangeIndex,
    onRevealControls,
    analysis
}) => (
    <div
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#050505',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
            userSelect: 'none',
            opacity: 0,
            animation: 'fadeInOverlay 0.2s ease-out forwards'
        }}
    >
        {panelState.showInfoPanel && (
            <div style={{ width: INFO_PANEL_WIDTH, height: '100vh', flexShrink: 0, zIndex: 1002, animation: 'slideInFromLeft 0.22s ease-out' }}>
                <InfoPanel
                    asset={asset}
                    width={INFO_PANEL_WIDTH}
                    activeTab={panelState.activeInfoTab}
                    onTabChange={panelState.setActiveInfoTab}
                    hoveredFaceKey={hoveredFaceKey}
                    onHoverFaceKey={setHoveredFaceKey}
                />
            </div>
        )}

        <PhotoViewport
            asset={asset}
            assetsLength={assets.length}
            currentIndex={currentIndex}
            showControls={showControls}
            setShowControls={setShowControls}
            showFaces={showFaces}
            setShowFaces={setShowFaces}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            hoveredFaceKey={hoveredFaceKey}
            setHoveredFaceKey={setHoveredFaceKey}
            panelState={panelState}
            onClose={onClose}
            onFaceClick={onFaceClick}
            onIsolateFace={onIsolateFace}
            onSetSensitivity={onSetSensitivity}
            onExtractAiMetadata={onExtractAiMetadata}
            onOpenSettings={onOpenSettings}
            onGetGroupOrbit={onGetGroupOrbit}
            onSetCanonical={onSetCanonical}
            onExplodeGroup={onExplodeGroup}
            onChangeIndex={onChangeIndex}
            onRevealControls={onRevealControls}
            analysis={analysis}
        />
    </div>
);

export const SinglePhotoView: FC<SinglePhotoViewProps> = ({
    assets,
    initialIndex,
    onClose,
    onPrioritize,
    onFaceClick,
    onIsolateFace,
    onSetSensitivity,
    onExtractAiMetadata,
    onGetGroupOrbit,
    onSetCanonical,
    onExplodeGroup,
    onOpenSettings,
    jobs,
    showInfoPanel,
    onShowInfoPanelChange,
    activeInfoTab,
    onActiveInfoTabChange
}) => {
    const panelState = usePanelState({ showInfoPanel, onShowInfoPanelChange, activeInfoTab, onActiveInfoTabChange });
    const controls = useSinglePhotoControls(initialIndex, assets.length);
    const analysisUi = useAnalysisUiState();
    const asset = assets[controls.currentIndex];

    useAssetPrioritization(asset?.id, onPrioritize);
    useAnalysisTracking({
        jobs,
        analyzingJobId: analysisUi.analyzingJobId,
        assetAiMetadata: asset?.ai_metadata,
        setAnalysisError: analysisUi.setAnalysisError,
        setAnalysisState: analysisUi.setAnalysisState,
        setAnalyzingJobId: analysisUi.setAnalyzingJobId,
        setAnalyzingAssetId: analysisUi.setAnalyzingAssetId,
        setShowInfoPanel: panelState.setShowInfoPanel
    });

    if (!asset) {return null;}

    return (
        <SinglePhotoOverlay
            asset={asset}
            assets={assets}
            currentIndex={controls.currentIndex}
            showControls={controls.showControls}
            setShowControls={controls.setShowControls}
            showFaces={controls.showFaces}
            setShowFaces={controls.setShowFaces}
            showActionMenu={controls.showActionMenu}
            setShowActionMenu={controls.setShowActionMenu}
            hoveredFaceKey={controls.hoveredFaceKey}
            setHoveredFaceKey={controls.setHoveredFaceKey}
            panelState={panelState}
            onClose={onClose}
            onFaceClick={onFaceClick}
            onIsolateFace={onIsolateFace}
            onSetSensitivity={onSetSensitivity}
            onExtractAiMetadata={onExtractAiMetadata}
            onOpenSettings={onOpenSettings}
            onGetGroupOrbit={onGetGroupOrbit}
            onSetCanonical={onSetCanonical}
            onExplodeGroup={onExplodeGroup}
            onChangeIndex={controls.onChangeIndex}
            onRevealControls={controls.revealControls}
            analysis={buildAnalysisState(analysisUi)}
        />
    );
};
