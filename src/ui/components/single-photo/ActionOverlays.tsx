import type React from 'react';
import type { Asset } from '@contracts/core';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import { ControlsOverlay } from './ActionOverlayControls';
import type { AnalysisUiState } from './ActionOverlayControls';
import { AnalysisErrorDialog } from './AnalysisErrorDialog';

interface ActionOverlaysProps {
    asset: Asset;
    assetsLength: number;
    currentIndex: number;
    showControls: boolean;
    showActionMenu: boolean;
    setShowActionMenu: (show: boolean) => void;
    showFaces: boolean;
    setShowFaces: (show: boolean) => void;
    isImageTransitionPending: boolean;
    scale: number;
    setScale: (s: number) => void;
    setPan: (pan: { x: number, y: number }) => void;
    resetPanZoom: () => void;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onMoveToBin?: (assetId: string) => Promise<void>;
    onRestoreFromBin?: (assetId: string) => Promise<void>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;
    analysisState: AnalysisUiState;
    setAnalysisState: (state: AnalysisUiState) => void;
    analysisError: string | null;
    setAnalysisError: (err: string | null) => void;
    analyzingAssetId: string | null;
    setAnalyzingAssetId: (id: string | null) => void;
    setAnalyzingJobId: (id: string | null) => void;
    showInfoPanel: boolean;
    setShowInfoPanel: (show: boolean) => void;
}

export const ActionOverlays: React.FC<ActionOverlaysProps> = ({
    asset,
    assetsLength,
    currentIndex,
    showControls,
    showActionMenu,
    setShowActionMenu,
    showFaces,
    setShowFaces,
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
    setShowInfoPanel
}) => (
    <>
        <ControlsOverlay
            asset={asset}
            assetsLength={assetsLength}
            currentIndex={currentIndex}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            showFaces={showFaces}
            setShowFaces={setShowFaces}
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
