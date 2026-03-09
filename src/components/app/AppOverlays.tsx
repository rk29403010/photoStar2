import type { Asset } from '../../../shared/types/core';
import type { BackgroundJob } from '../../../shared/types/jobs';
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
  onRecognise: () => void;
  onCluster: () => void;
  onScanSensitive: () => void;
  onScanSensitiveAll: () => void;
  onExtractAiMetadata: (assetId?: string) => Promise<string | undefined>;
  onRefresh: () => void;
  onResetFaces: () => void;
  onResetAll: () => void;
  onFactoryReset: () => void;
  onStopScan: () => void;
  onBuildGroups: () => void;
  onBuildBursts: () => void;
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
  onGetGroupOrbit: (groupId: string) => Promise<Asset[]>;
  onSetCanonical: (groupId: string, assetId: string) => Promise<void>;
  onExplodeGroup: (groupId: string) => Promise<void>;
  onStopJob: (id: string) => void;
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
        onRecognise={props.onRecognise}
        onCluster={props.onCluster}
        onScanSensitive={props.onScanSensitive}
        onScanSensitiveAll={props.onScanSensitiveAll}
        onExtractAiMetadata={props.onExtractAiMetadata}
        onRefresh={props.onRefresh}
        onResetFaces={props.onResetFaces}
        onResetAll={props.onResetAll}
        onFactoryReset={props.onFactoryReset}
        onStopScan={props.onStopScan}
        onBuildGroups={props.onBuildGroups}
        onBuildBursts={props.onBuildBursts}
        onOpenSettings={() => props.setShowSettings(true)}
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
          jobs={props.jobs}
        />
      )}

      <TaskDrawer jobs={props.jobs} onStop={props.onStopJob} />
    </>
  );
}

