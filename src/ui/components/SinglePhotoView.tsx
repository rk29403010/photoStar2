import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, FC, SetStateAction } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import type { PanelState, AnalysisState } from './single-photo/PhotoViewport';
import { SinglePhotoOverlay } from './single-photo/SinglePhotoOverlay';
import {
    applyStarSelection,
    clearGroupMembership,
    dedupeSinglePhotoAssets,
    isLibrarySelectionAnchorAsset,
    mergeSinglePhotoAssets,
    resolveSinglePhotoAssetIndex,
} from './single-photo/singlePhotoAssetModel';
import { CONTROLS_IDLE_MS } from './single-photo/singlePhotoOverlayLayout';
import { useSinglePhotoAssetLifecycle } from './single-photo/useSinglePhotoAssetLifecycle';
import { usePhotoMetadataEvidenceLoader } from './single-photo/usePhotoMetadataEvidenceLoader';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';

interface SinglePhotoViewProps {
    assets: Asset[];
    initialIndex: number;
    onClose: () => void;
    onAssetFocusChange?: (assetId: string) => void;
    onPrioritize: (mediaId: string) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onOpenSettings?: () => void;
    onLoadAssetEvidence?: (assetId: string) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    showInfoPanel?: boolean;
    onShowInfoPanelChange?: (v: boolean) => void;
    activeInfoTab?: 'file' | 'analysis' | 'people' | 'json';
    onActiveInfoTabChange?: (t: 'file' | 'analysis' | 'people' | 'json') => void;
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
    setCurrentIndex: Dispatch<SetStateAction<number>>;
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
        setCurrentIndex,
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
    analyzingAssetId: string | null;
    currentAssetId: string | undefined;
    assetAiMetadata: Asset['ai_metadata'] | undefined;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    setAnalysisState: Dispatch<SetStateAction<AnalysisUiState>>;
    setAnalyzingJobId: Dispatch<SetStateAction<string | null>>;
    setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>;
    setShowInfoPanel: (v: boolean) => void;
}) {
    const {
        analyzingAssetId,
        currentAssetId,
        assetAiMetadata,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
        setShowInfoPanel
    } = params;

    useEffect(() => {
        if (!analyzingAssetId || currentAssetId !== analyzingAssetId) {return;}

        if (!assetAiMetadata) {
            return;
        }

        setTimeout(() => {
            setAnalysisError(null);
            setAnalysisState('idle');
            setAnalyzingAssetId(null);
            setAnalyzingJobId(null);
            setShowInfoPanel(true);
        }, 0);
    }, [
        analyzingAssetId,
        currentAssetId,
        assetAiMetadata,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
        setShowInfoPanel
    ]);
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

function useSinglePhotoAssetState(params: {
    assets: Asset[];
    initialIndex: number;
    onSetCanonical?: (groupId: string, assetId: string, asset: Asset) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
}) {
    const { assets, initialIndex, onSetCanonical, onExplodeGroup } = params;
    const [orbitAssets, setOrbitAssets] = useState<Asset[]>([]);
    const viewAssets = mergeSinglePhotoAssets(assets, orbitAssets);
    const initialAssetId = assets[initialIndex]?.id ?? null;
    const initialViewIndex = initialAssetId ? Math.max(resolveSinglePhotoAssetIndex(viewAssets, initialAssetId), 0) : initialIndex;
    const handleOrbitLoaded = useCallback((nextOrbitAssets: Asset[]) => {
        setOrbitAssets(dedupeSinglePhotoAssets(nextOrbitAssets));
    }, []);

    const handleSetCanonical = useCallback(async (groupId: string, assetId: string) => {
        const selectedAsset = viewAssets.find((asset) => asset.id === assetId);
        if (!selectedAsset) {
            return;
        }

        await onSetCanonical?.(groupId, assetId, selectedAsset);
        setOrbitAssets((previousOrbitAssets) => applyStarSelection(previousOrbitAssets, groupId, assetId));
    }, [onSetCanonical, viewAssets]);

    const handleExplodeGroup = useCallback(async (groupId: string) => {
        await onExplodeGroup?.(groupId);
        setOrbitAssets((previousOrbitAssets) => clearGroupMembership(previousOrbitAssets, groupId));
    }, [onExplodeGroup]);

    return { viewAssets, initialViewIndex, handleOrbitLoaded, handleSetCanonical, handleExplodeGroup };
}

function useSinglePhotoViewState(params: {
    assets: Asset[];
    initialIndex: number;
    panelState: ReturnType<typeof usePanelState>;
    analysisUi: AnalysisUiBundle;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onAssetFocusChange?: (assetId: string) => void;
    onPrioritize: (mediaId: string) => void;
    onLoadAssetEvidence?: (assetId: string) => Promise<void>;
}) {
    const assetState = useSinglePhotoAssetState({
        assets: params.assets,
        initialIndex: params.initialIndex,
        onSetCanonical: params.onSetCanonical,
        onExplodeGroup: params.onExplodeGroup,
    });
    const controls = useSinglePhotoControls(assetState.initialViewIndex, assetState.viewAssets.length);
    const asset = assetState.viewAssets[controls.currentIndex];
    const setCurrentIndex = controls.setCurrentIndex;
    const shouldSyncAssetFocus = isLibrarySelectionAnchorAsset(params.assets, asset?.id);

    const handleSelectAsset = useCallback((assetId: string) => {
        const nextIndex = resolveSinglePhotoAssetIndex(assetState.viewAssets, assetId);
        if (nextIndex < 0) {return;}
        setCurrentIndex(nextIndex);
    }, [assetState.viewAssets, setCurrentIndex]);

    useSinglePhotoAssetLifecycle({
        assetId: asset?.id,
        shouldSyncAssetFocus,
        onAssetFocusChange: params.onAssetFocusChange,
        onPrioritize: params.onPrioritize,
    });
    usePhotoMetadataEvidenceLoader({
        activeTab: params.panelState.activeInfoTab,
        asset,
        loadAssetEvidence: params.onLoadAssetEvidence,
    });
    useAnalysisTracking({
        analyzingAssetId: params.analysisUi.analyzingAssetId,
        currentAssetId: asset?.id,
        assetAiMetadata: asset?.ai_metadata,
        setAnalysisError: params.analysisUi.setAnalysisError,
        setAnalysisState: params.analysisUi.setAnalysisState,
        setAnalyzingJobId: params.analysisUi.setAnalyzingJobId,
        setAnalyzingAssetId: params.analysisUi.setAnalyzingAssetId,
        setShowInfoPanel: params.panelState.setShowInfoPanel,
    });

    return {
        asset,
        controls,
        viewAssets: assetState.viewAssets,
        handleOrbitLoaded: assetState.handleOrbitLoaded,
        handleSetCanonical: assetState.handleSetCanonical,
        handleExplodeGroup: assetState.handleExplodeGroup,
        handleSelectAsset,
    };
}

export const SinglePhotoView: FC<SinglePhotoViewProps> = ({
    assets,
    initialIndex,
    onClose,
    onAssetFocusChange,
    onPrioritize,
    onFaceClick,
    onIsolateFace,
    onSetSensitivity,
    onExtractAiMetadata,
    onGetGroupOrbit,
    onSetCanonical,
    onExplodeGroup,
    onOpenSettings,
    onLoadAssetEvidence,
    onFlagPhotoDateCorrection,
    showInfoPanel,
    onShowInfoPanelChange,
    activeInfoTab,
    onActiveInfoTabChange
}) => {
    const panelState = usePanelState({ showInfoPanel, onShowInfoPanelChange, activeInfoTab, onActiveInfoTabChange });
    const analysisUi = useAnalysisUiState();
    const {
        asset,
        controls,
        viewAssets,
        handleOrbitLoaded,
        handleSetCanonical,
        handleExplodeGroup,
        handleSelectAsset,
    } = useSinglePhotoViewState({
        assets,
        initialIndex,
        panelState,
        analysisUi,
        onSetCanonical,
        onExplodeGroup,
        onAssetFocusChange,
        onPrioritize,
        onLoadAssetEvidence,
    });

    if (!asset) {return null;}

    return (
        <SinglePhotoOverlay
            asset={asset}
            assets={viewAssets}
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
            onOrbitLoaded={handleOrbitLoaded}
            onSelectAsset={handleSelectAsset}
            onSetCanonical={handleSetCanonical}
            onExplodeGroup={handleExplodeGroup}
            onFlagPhotoDateCorrection={onFlagPhotoDateCorrection}
            onChangeIndex={controls.onChangeIndex}
            onRevealControls={controls.revealControls}
            analysis={buildAnalysisState(analysisUi)}
        />
    );
};
