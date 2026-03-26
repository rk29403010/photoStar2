import type { Asset, SimilarityOrbit } from '@contracts/core';
import type { BackgroundJob } from '@contracts/jobs';
import type { AiMode } from '@ui/hooks/useAppRuntimeUi';
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
  onScanSensitive: () => void;
  onScanSensitiveAll: () => void;
  onExtractAiMetadata: (assetId?: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>;
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
  onOpenSettingsFromPhoto: () => void;
  onGetGroupOrbit: (groupId: string) => Promise<SimilarityOrbit>;
  onSetCanonical: (groupId: string, assetId: string) => Promise<void>;
  onExplodeGroup: (groupId: string) => Promise<void>;
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
        aiMode={props.aiMode}
        setAiMode={props.setAiMode}
        onScan={props.onScan}
        onPreviews={props.onPreviews}
        onDetect={props.onDetect}
        onCluster={props.onCluster}
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
          onExtractAiMetadata={props.onExtractAiMetadata}
          onOpenSettings={props.onOpenSettingsFromPhoto}
          onGetGroupOrbit={props.onGetGroupOrbit}
          onSetCanonical={props.onSetCanonical}
          onExplodeGroup={props.onExplodeGroup}
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
