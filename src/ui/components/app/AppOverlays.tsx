import type { Asset, ReviewItemSummary, SimilarityOrbit } from '@contracts/core';
import type { BackgroundJob } from '@contracts/jobs';
import type { AiMode } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { TaskDrawer } from '../jobs/TaskDrawer';
import { ActionPanel } from '../ActionPanel';
import { SettingsModal } from '../SettingsModal';
import { SinglePhotoView } from '../SinglePhotoView';

type InfoTab = 'file' | 'analysis' | 'people' | 'json';

interface AppOverlaysProps {
  assets: Asset[];
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  showActions: boolean;
  setShowActions: (show: boolean) => void;
  aiMode: AiMode;
  setAiMode: (mode: AiMode) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showInfoPanel: boolean;
  setShowInfoPanel: (show: boolean) => void;
  activeInfoTab: InfoTab;
  setActiveInfoTab: (tab: InfoTab) => void;
  jobs: BackgroundJob[];
  folderHistory: { path: string; last_scanned_at: string }[];
  onScan: (specificPath?: string) => Promise<void>;
  onPreviews: () => void;
  onDetect: () => void;
  onCluster: () => void;
  onRecalculatePhotoDates: () => Promise<string>;
  onScanSensitive: () => void;
  onScanSensitiveAll: () => void;
  onExtractAiMetadata: (assetId?: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>;
  onRerunFaceDetection: (assetId: string) => Promise<string | undefined>;
  onRefresh: () => void;
  onResetFaces: () => void;
  onResetAll: () => void;
  onFactoryReset: () => void;
  onResetGroupingData: () => void;
  onStopScan: () => void;
  onOpenGroupDiagnostics: () => void;
  onGetSetting: (key: string) => Promise<string>;
  onSetSetting: (key: string, value: string) => Promise<void>;
  theme: string;
  setTheme: (theme: string) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  onPrioritize: (mediaId: string) => void;
  onFaceClick: (personId: string, personName: string) => void;
  onIsolateFace: (assetId: string, faceIndex: number) => void;
  onSetSensitivity: (assetId: string, status: string | null) => void;
  onMoveToBin: (assetId: string) => Promise<void>;
  onRestoreFromBin: (assetId: string) => Promise<void>;
  onOpenSettingsFromPhoto: () => void;
  onLoadAssetEvidence: (assetId: string) => Promise<void>;
  onGetGroupOrbit: (groupId: string) => Promise<SimilarityOrbit>;
  onSetCanonical: (groupId: string, assetId: string) => Promise<void>;
  onExplodeGroup: (groupId: string) => Promise<void>;
  onAssignAssetTag: (assetId: string, tagLabel: string) => Promise<void>;
  onRemoveAssetTag: (assetId: string, tagDefinitionId: string) => Promise<void>;
  onSetReviewItemStatus: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  onFlagPhotoDateCorrection: (input: PhotoDateCorrectionInput) => Promise<void>;
  onStopJob: (job: BackgroundJob) => void;
  isTaskDrawerMinimized: boolean;
  onTaskDrawerMinimizedChange: (minimized: boolean) => void;
}

export function AppOverlays(props: AppOverlaysProps) {
  const selectedIndex = props.selectedAssetId ? props.assets.findIndex((asset) => asset.id === props.selectedAssetId) : -1;
  const hasSelectedAsset = selectedIndex >= 0;

  return (
    <>
      <ActionPanel
        isOpen={props.showActions}
        onClose={() => props.setShowActions(false)}
        onScan={props.onScan}
        onPreviews={props.onPreviews}
        onDetect={props.onDetect}
        onCluster={props.onCluster}
        onRecalculatePhotoDates={props.onRecalculatePhotoDates}
        onScanSensitive={props.onScanSensitive}
        onScanSensitiveAll={props.onScanSensitiveAll}
        onExtractAiMetadata={props.onExtractAiMetadata}
        onRefresh={props.onRefresh}
        onResetFaces={props.onResetFaces}
        onResetAll={props.onResetAll}
        onFactoryReset={props.onFactoryReset}
        onResetGroupingData={props.onResetGroupingData}
        onStopScan={props.onStopScan}
        onOpenGroupDiagnostics={props.onOpenGroupDiagnostics}
        folderHistory={props.folderHistory}
      />

      <SettingsModal
        isOpen={props.showSettings}
        onClose={() => props.setShowSettings(false)}
        getSetting={props.onGetSetting}
        setSetting={props.onSetSetting}
        theme={props.theme}
        setTheme={props.setTheme}
        animationsEnabled={props.animationsEnabled}
        setAnimationsEnabled={props.setAnimationsEnabled}
        aiMode={props.aiMode}
        setAiMode={props.setAiMode}
      />

      {hasSelectedAsset && (
        <SinglePhotoView
          assets={props.assets}
          initialIndex={selectedIndex}
          onClose={() => props.setSelectedAssetId(null)}
          onAssetFocusChange={props.setSelectedAssetId}
          onPrioritize={props.onPrioritize}
          showInfoPanel={props.showInfoPanel}
          onShowInfoPanelChange={props.setShowInfoPanel}
          activeInfoTab={props.activeInfoTab}
          onActiveInfoTabChange={props.setActiveInfoTab}
          onFaceClick={props.onFaceClick}
          onIsolateFace={props.onIsolateFace}
          onSetSensitivity={props.onSetSensitivity}
          onMoveToBin={props.onMoveToBin}
          onRestoreFromBin={props.onRestoreFromBin}
          onExtractAiMetadata={props.onExtractAiMetadata}
          onRerunFaceDetection={props.onRerunFaceDetection}
          onOpenSettings={props.onOpenSettingsFromPhoto}
          onLoadAssetEvidence={props.onLoadAssetEvidence}
          onGetGroupOrbit={props.onGetGroupOrbit}
          onSetCanonical={props.onSetCanonical}
          onExplodeGroup={props.onExplodeGroup}
          onAssignAssetTag={props.onAssignAssetTag}
          onRemoveAssetTag={props.onRemoveAssetTag}
          onSetReviewItemStatus={props.onSetReviewItemStatus}
          onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
        />
      )}

      <TaskDrawer
        jobs={props.jobs}
        onStop={props.onStopJob}
        isMinimized={props.isTaskDrawerMinimized}
        onMinimize={props.onTaskDrawerMinimizedChange}
      />
    </>
  );
}
