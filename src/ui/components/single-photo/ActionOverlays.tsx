import type React from 'react';
import type { Asset } from '@contracts/core';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import { ControlsOverlay } from './ActionOverlayControls';
import type { AnalysisUiState } from './ActionOverlayControls';
import { AnalysisErrorDialog } from './AnalysisErrorDialog';

type ActionOverlaysProps = {
    readonly asset: Asset;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showControls: boolean;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: (show: boolean) => void;
    readonly isImageTransitionPending: boolean;
    readonly scale: number;
    readonly setScale: (s: number) => void;
    readonly setPan: (pan: { x: number, y: number }) => void;
    readonly resetPanZoom: () => void;
    readonly onClose: () => void;
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onOpenSettings?: () => void;
    readonly analysisState: AnalysisUiState;
    readonly setAnalysisState: (state: AnalysisUiState) => void;
    readonly analysisError: string | null;
    readonly setAnalysisError: (err: string | null) => void;
    readonly analyzingAssetId: string | null;
    readonly setAnalyzingAssetId: (id: string | null) => void;
    readonly setAnalyzingJobId: (id: string | null) => void;
    readonly showInfoPanel: boolean;
    readonly setShowInfoPanel: (show: boolean) => void;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[], parameters?: Record<string, unknown>) => void;
    readonly onEditPhoto?: () => void;
    readonly hasFrame: boolean;
    readonly showWithFrame: boolean;
    readonly setShowWithFrame: (show: boolean) => void;
}

export const ActionOverlays: React.FC<ActionOverlaysProps> = ({
    asset,
    assetsLength,
    currentIndex,
    showControls,
    showActionMenu,
    setShowActionMenu,
    isImageTransitionPending,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onPrevious,
    onNext,
    onSetSensitivity,
    onMoveToBin,
    onRestoreFromBin,
    onSetCanonical,
    onExplodeGroup,
    onExtractAiMetadata,
    onRerunFaceDetection,
    onOpenSettings,
    analysisState,
    setAnalysisState,
    analysisError,
    setAnalysisError,
    analyzingAssetId,
    setAnalyzingAssetId,
    setAnalyzingJobId,
    showInfoPanel,
    setShowInfoPanel,
    onRunWorkflowOnAssets,
    onEditPhoto,
    hasFrame,
    showWithFrame,
    setShowWithFrame
}) => (
    <>
        <ControlsOverlay
            asset={asset}
            assetsLength={assetsLength}
            currentIndex={currentIndex}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            isImageTransitionPending={isImageTransitionPending}
            scale={scale}
            setScale={setScale}
            setPan={setPan}
            resetPanZoom={resetPanZoom}
            onClose={onClose}
            onPrevious={onPrevious}
            onNext={onNext}
            onSetSensitivity={onSetSensitivity}
            onMoveToBin={onMoveToBin}
            onRestoreFromBin={onRestoreFromBin}
            onSetCanonical={onSetCanonical}
            onExplodeGroup={onExplodeGroup}
            onExtractAiMetadata={onExtractAiMetadata}
            onRerunFaceDetection={onRerunFaceDetection}
            analysisState={analysisState}
            setAnalysisState={setAnalysisState}
            setAnalysisError={setAnalysisError}
            analyzingAssetId={analyzingAssetId}
            setAnalyzingAssetId={setAnalyzingAssetId}
            setAnalyzingJobId={setAnalyzingJobId}
            showInfoPanel={showInfoPanel}
            setShowInfoPanel={setShowInfoPanel}
            controlsVisible={showControls}
            onRunWorkflowOnAssets={onRunWorkflowOnAssets}
            onEditPhoto={onEditPhoto}
            hasFrame={hasFrame}
            showWithFrame={showWithFrame}
            setShowWithFrame={setShowWithFrame}
        />
        {analysisError && (
            <AnalysisErrorDialog
                analysisError={analysisError}
                setAnalysisError={setAnalysisError}
                onOpenSettings={onOpenSettings}
            />
        )}
    </>
);
