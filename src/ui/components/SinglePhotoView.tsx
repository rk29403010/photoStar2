import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, FC, SetStateAction } from 'react';
import type { Asset, ReviewItemSummary, SimilarityOrbit } from '@contracts/core';
import type { PanelState } from './single-photo/PhotoViewport';
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
import type { WorkflowRunDetailResponse } from '@boundary/runtime/workflowRunDetail';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import {
    buildAnalysisState,
    type AnalysisUiBundle,
    useAnalysisTracking,
    useAnalysisUiState,
    useAnalysisWorkflowFailureTracking,
} from './single-photo/singlePhotoAnalysisState';

type SinglePhotoViewProps = {
    readonly assets: Asset[];
    readonly initialIndex: number;
    readonly onClose: () => void;
    readonly onAssetFocusChange?: (assetId: string) => void;
    readonly onPrioritize: (mediaId: string) => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onGetWorkflowRunDetail?: (runId: string) => Promise<WorkflowRunDetailResponse>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly onOpenSettings?: () => void;
    readonly onLoadAssetEvidence?: (assetId: string) => Promise<void>;
    readonly onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    readonly onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    readonly onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    readonly showInfoPanel?: boolean;
    readonly onShowInfoPanelChange?: (v: boolean) => void;
    readonly activeInfoTab?: ActiveInfoTab;
    readonly onActiveInfoTabChange?: (t: ActiveInfoTab) => void;
    readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
    readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
}

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

export type ActiveInfoTab = 'file' | 'analysis' | 'people' | 'json' | 'ailogs';

function usePanelState({
    showInfoPanel: showInfoPanelProp,
    onShowInfoPanelChange,
    activeInfoTab: activeInfoTabProp,
    onActiveInfoTabChange
}: Pick<SinglePhotoViewProps, 'showInfoPanel' | 'onShowInfoPanelChange' | 'activeInfoTab' | 'onActiveInfoTabChange'>): PanelState & { setActiveInfoTab: (t: ActiveInfoTab) => void } {
    const [showInfoPanelInternal, setShowInfoPanelInternal] = useState(false);
    const showInfoPanel = showInfoPanelProp ?? showInfoPanelInternal;
    const setShowInfoPanel = useCallback((value: boolean) => {
        setShowInfoPanelInternal(value);
        onShowInfoPanelChange?.(value);
    }, [onShowInfoPanelChange]);
    const [activeInfoTabInternal, setActiveInfoTabInternal] = useState<ActiveInfoTab>('file');
    const activeInfoTab = activeInfoTabProp ?? activeInfoTabInternal;
    const setActiveInfoTab = useCallback((tab: ActiveInfoTab) => {
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
    const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearControlsHideTimer = useCallback(() => {
        if (controlsHideTimerRef.current !== null) {
            globalThis.clearTimeout(controlsHideTimerRef.current);
            controlsHideTimerRef.current = null;
        }
    }, []);
    const scheduleControlsHide = useCallback(() => {
        clearControlsHideTimer();
        controlsHideTimerRef.current = globalThis.setTimeout(() => {
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
    onGetWorkflowRunDetail?: (runId: string) => Promise<WorkflowRunDetailResponse>;
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

    const analysisUi = useAnalysisUiState(asset?.id ?? null);

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
        analyzingAssetId: analysisUi.analyzingAssetId,
        currentAssetId: asset?.id,
        assetAiMetadata: asset?.ai_metadata,
        setAnalysisError: analysisUi.setAnalysisError,
        setAnalysisState: analysisUi.setAnalysisState,
        setAnalyzingJobId: analysisUi.setAnalyzingJobId,
        setAnalyzingAssetId: analysisUi.setAnalyzingAssetId,
        setShowInfoPanel: params.panelState.setShowInfoPanel,
    });
    useAnalysisWorkflowFailureTracking({
        analyses: analysisUi.analyses,
        setAssetAnalysis: analysisUi.setAssetAnalysis,
        clearAssetAnalysis: analysisUi.clearAssetAnalysis,
        currentAssetId: asset?.id,
        onGetWorkflowRunDetail: params.onGetWorkflowRunDetail,
    });

    return {
        asset,
        controls,
        viewAssets: assetState.viewAssets,
        handleOrbitLoaded: assetState.handleOrbitLoaded,
        handleSetCanonical: assetState.handleSetCanonical,
        handleExplodeGroup: assetState.handleExplodeGroup,
        handleSelectAsset,
        analysisUi,
    };
}

function renderSinglePhotoOverlay(params: {
    asset: Asset;
    viewAssets: Asset[];
    controls: ControlsState;
    panelState: ReturnType<typeof usePanelState>;
    analysisUi: AnalysisUiBundle;
    props: SinglePhotoViewProps;
    handleOrbitLoaded: (assets: Asset[]) => void;
    handleSetCanonical: (groupId: string, assetId: string) => Promise<void>;
    handleExplodeGroup: (groupId: string) => Promise<void>;
    handleSelectAsset: (assetId: string) => void;
}) {
    return (
        <SinglePhotoOverlay
            asset={params.asset}
            assets={params.viewAssets}
            currentIndex={params.controls.currentIndex}
            showControls={params.controls.showControls}
            setShowControls={params.controls.setShowControls}
            showFaces={params.controls.showFaces}
            setShowFaces={params.controls.setShowFaces}
            showActionMenu={params.controls.showActionMenu}
            setShowActionMenu={params.controls.setShowActionMenu}
            hoveredFaceKey={params.controls.hoveredFaceKey}
            setHoveredFaceKey={params.controls.setHoveredFaceKey}
            panelState={params.panelState}
            onClose={params.props.onClose}
            onFaceClick={params.props.onFaceClick}
            onIsolateFace={params.props.onIsolateFace}
            onSetSensitivity={params.props.onSetSensitivity}
            onMoveToBin={params.props.onMoveToBin}
            onRestoreFromBin={params.props.onRestoreFromBin}
            onExtractAiMetadata={params.props.onExtractAiMetadata}
            onRerunFaceDetection={params.props.onRerunFaceDetection}
            onOpenSettings={params.props.onOpenSettings}
            onGetGroupOrbit={params.props.onGetGroupOrbit}
            onOrbitLoaded={params.handleOrbitLoaded}
            onSelectAsset={params.handleSelectAsset}
            onSetCanonical={params.handleSetCanonical}
            onExplodeGroup={params.handleExplodeGroup}
            onAssignAssetTag={params.props.onAssignAssetTag}
            onRemoveAssetTag={params.props.onRemoveAssetTag}
            onSetReviewItemStatus={params.props.onSetReviewItemStatus}
            onFlagPhotoDateCorrection={params.props.onFlagPhotoDateCorrection}
            onGetAiCallsLog={params.props.onGetAiCallsLog}
            onGetAiCallLogDetail={params.props.onGetAiCallLogDetail}
            onChangeIndex={params.controls.onChangeIndex}
            onRevealControls={params.controls.revealControls}
            analysis={buildAnalysisState(params.analysisUi)}
        />
    );
}

export const SinglePhotoView: FC<SinglePhotoViewProps> = (props) => {
    const panelState = usePanelState(props);
    const {
        asset,
        controls,
        viewAssets,
        handleOrbitLoaded,
        handleSetCanonical,
        handleExplodeGroup,
        handleSelectAsset,
        analysisUi,
    } = useSinglePhotoViewState({
        assets: props.assets,
        initialIndex: props.initialIndex,
        panelState,
        onGetWorkflowRunDetail: props.onGetWorkflowRunDetail,
        onSetCanonical: props.onSetCanonical,
        onExplodeGroup: props.onExplodeGroup,
        onAssetFocusChange: props.onAssetFocusChange,
        onPrioritize: props.onPrioritize,
        onLoadAssetEvidence: props.onLoadAssetEvidence,
    });

    if (!asset) {return null;}

    return renderSinglePhotoOverlay({
        asset,
        viewAssets,
        controls,
        panelState,
        analysisUi,
        props,
        handleOrbitLoaded,
        handleSetCanonical,
        handleExplodeGroup,
        handleSelectAsset,
    });
};
