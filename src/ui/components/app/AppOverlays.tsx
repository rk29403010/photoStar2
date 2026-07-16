import { useMemo } from 'react';
import type {
  Asset,
  PhotoEditDocument,
  PhotoEditMask,
  PhotoEditOperation,
  PhotoEditStyle,
  RenderPhotoEditInput,
  ReviewItemSummary,
  SavePhotoEditInput,
  SimilarityOrbit,
} from '@contracts/core';
import type { BackgroundJob } from '@contracts/jobs';
import type { WorkflowRunDetailResponse } from '@boundary/runtime/workflowRunDetail';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import type { AiMode, InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { getLibrarySelectionAssetIds, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { TaskDrawer } from '../jobs/TaskDrawer';
import { ActionPanel } from '../ActionPanel';
import { SettingsModal } from '../SettingsModal';
import { SinglePhotoView } from '../SinglePhotoView';
import { resolveSinglePhotoOverlaySelection } from './singlePhotoOverlaySelection';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';


type AppOverlaysProps = {
  readonly assets: Asset[];
  readonly selectedAssetId: string | null;
  readonly setSelectedAssetId: (id: string | null) => void;
  readonly showActions: boolean;
  readonly setShowActions: (show: boolean) => void;
  readonly aiMode: AiMode;
  readonly setAiMode: (mode: AiMode) => void;
  readonly showSettings: boolean;
  readonly setShowSettings: (show: boolean) => void;
  readonly showInfoPanel: boolean;
  readonly setShowInfoPanel: (show: boolean) => void;
  readonly activeInfoTab: InfoTab;
  readonly setActiveInfoTab: (tab: InfoTab) => void;
  readonly jobs: BackgroundJob[];
  readonly folderHistory: { path: string; last_scanned_at: string }[];
  readonly onScan: (specificPath?: string) => Promise<void>;
  readonly onPreviews: () => void;
  readonly onDetect: () => void;
  readonly onCluster: () => void;
  readonly onRecalculatePhotoDates: () => Promise<string>;
  readonly onScanSensitive: () => void;
  readonly onScanSensitiveAll: () => void;
  readonly onExtractAiMetadata: (assetId?: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
  readonly onGetWorkflowRunDetail: (runId: string) => Promise<WorkflowRunDetailResponse>;
  readonly onRerunFaceDetection: (assetId: string) => Promise<string | undefined>;
  readonly onRefresh: () => void;
  readonly onResetFaces: () => void;
  readonly onResetAll: () => void;
  readonly onFactoryReset: () => void;
  readonly onResetGroupingData: () => void;
  readonly onStopScan: () => void;
  readonly onOpenGroupDiagnostics: () => void;
  readonly onStartSimulationWorkflow: (params?: { speed?: string; iterations?: string; errorType?: string; errorRate?: string }) => void;
  readonly onGetSetting: (key: string) => Promise<string>;
  readonly onSetSetting: (key: string, value: string) => Promise<void>;
  readonly onTestProviderKey: (provider: string, key: string) => Promise<{ valid: boolean; error?: string }>;
  readonly onSaveProviderKey: (provider: string, key: string) => Promise<{ success: boolean; error?: string }>;
  readonly onDeleteProviderKey: (provider: string) => Promise<{ success: boolean; error?: string }>;
  readonly onGetRedactedProviderKey: (provider: string) => Promise<{ redactedKey: string | null; error?: string }>;
  readonly theme: string;
  readonly setTheme: (theme: string) => void;
  readonly animationsEnabled: boolean;
  readonly setAnimationsEnabled: (enabled: boolean) => void;
  readonly onPrioritize: (mediaId: string) => void;
  readonly onFaceClick: (personId: string, personName: string) => void;
  readonly onIsolateFace: (assetId: string, faceIndex: number) => void;
  readonly onSetSensitivity: (assetId: string, status: string | null) => void;
  readonly onMoveToBin: (assetId: string) => Promise<void>;
  readonly onRestoreFromBin: (assetId: string) => Promise<void>;
  readonly onOpenSettingsFromPhoto: () => void;
  readonly onLoadAssetEvidence: (assetId: string) => Promise<void>;
  readonly onGetGroupOrbit: (groupId: string) => Promise<SimilarityOrbit>;
  readonly onSetCanonical: (groupId: string, assetId: string) => Promise<void>;
  readonly onExplodeGroup: (groupId: string) => Promise<void>;
  readonly onAssignAssetTag: (assetId: string, tagLabel: string) => Promise<void>;
  readonly onRemoveAssetTag: (assetId: string, tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  readonly onFlagPhotoDateCorrection: (input: PhotoDateCorrectionInput) => Promise<void>;
  readonly onStopJob: (job: BackgroundJob) => void;
  readonly isTaskDrawerMinimized: boolean;
  readonly onTaskDrawerMinimizedChange: (minimized: boolean) => void;
  readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
  readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
  readonly librarySelection: LibrarySelectionState;
  readonly onRunWorkflowOnAssets: (workflowId: string, assetIds: string[]) => void;
  readonly onRecordPhotoMetadataAssertion?: (assetId: string, fieldPath: string, value: unknown, note?: string | null) => Promise<void>;
  readonly onGetPhotoEditWorkspace?: (assetId: string) => Promise<{ document: PhotoEditDocument | null; styles: PhotoEditStyle[] }>;
  readonly onPreviewPhotoEdit?: (input: SavePhotoEditInput) => Promise<string>;
  readonly onSavePhotoEdit?: (input: SavePhotoEditInput) => Promise<PhotoEditDocument>;
  readonly onRenderPhotoEdit?: (input: RenderPhotoEditInput) => Promise<{ document: PhotoEditDocument; assetId: string }>;
  readonly onSavePhotoEditStyle?: (style: { id: string; name: string; operations: PhotoEditOperation[]; masks: PhotoEditMask[] }) => Promise<void>;
}

function requestEditor<T>(command: string, payload: Record<string, unknown>, select: (data: Record<string, unknown>) => T): Promise<T> {
  if (!globalRequest) {return Promise.reject(new Error('Photo editor is unavailable until the backend is connected'));}
  return globalRequest<T>({ idPrefix: `${command}_${Date.now()}`, command, payload, timeoutMs: 120000, select: (data) => select(data ?? {}) });
}

const defaultPhotoEditActions = {
  getWorkspace: (assetId: string) => requestEditor('get_photo_edit_workspace', { assetId }, (data) => data as { document: PhotoEditDocument | null; styles: PhotoEditStyle[] }),
  preview: (input: SavePhotoEditInput) => requestEditor('preview_photo_edit', input, (data) => data.previewDataUrl as string),
  save: (input: SavePhotoEditInput) => requestEditor('save_photo_edit', input, (data) => data.document as PhotoEditDocument),
  render: (input: RenderPhotoEditInput) => requestEditor('render_photo_edit', input, (data) => data as { document: PhotoEditDocument; assetId: string }),
  saveStyle: (style: { id: string; name: string; operations: PhotoEditOperation[]; masks: PhotoEditMask[] }) => requestEditor('save_photo_edit_style', style, () => undefined),
};

function createSelectedAssetCache() {
  let fallbackSelectedAsset: Asset | null = null;

  return {
    update(selectedAssetId: string | null, currentSelectedAsset: Asset | null) {
      if (!selectedAssetId) {
        fallbackSelectedAsset = null;
      } else if (currentSelectedAsset) {
        fallbackSelectedAsset = currentSelectedAsset;
      }

      return fallbackSelectedAsset;
    },
  };
}

function useSinglePhotoOverlayState(props: Pick<AppOverlaysProps, 'assets' | 'selectedAssetId'>) {
  const cache = useMemo(() => createSelectedAssetCache(), []);
  const currentSelectedAsset = props.selectedAssetId
    ? props.assets.find((asset) => asset.id === props.selectedAssetId) ?? null
    : null;
  const fallbackSelectedAsset = cache.update(props.selectedAssetId, currentSelectedAsset);

  const { overlayAssets, selectedIndex } = resolveSinglePhotoOverlaySelection({
    assets: props.assets,
    selectedAssetId: props.selectedAssetId,
    fallbackSelectedAsset,
  });

  return {
    overlayAssets,
    selectedIndex,
    hasSelectedAsset: props.selectedAssetId !== null && selectedIndex >= 0,
  };
}

function renderSinglePhotoView(props: AppOverlaysProps, overlayAssets: Asset[], selectedIndex: number) {
  return (
    <SinglePhotoView
      assets={overlayAssets}
      initialIndex={selectedIndex}
      onClose={() => props.setSelectedAssetId(null)}
      onAssetFocusChange={props.setSelectedAssetId}
      onPrioritize={props.onPrioritize}
      showInfoPanel={props.showInfoPanel}
      onShowInfoPanelChange={props.setShowInfoPanel}
      activeInfoTab={props.activeInfoTab}
      onActiveInfoTabChange={props.setActiveInfoTab}
      onGetAiCallsLog={props.onGetAiCallsLog}
      onGetAiCallLogDetail={props.onGetAiCallLogDetail}
      onFaceClick={props.onFaceClick}
      onIsolateFace={props.onIsolateFace}
      onSetSensitivity={props.onSetSensitivity}
      onMoveToBin={props.onMoveToBin}
      onRestoreFromBin={props.onRestoreFromBin}
      onExtractAiMetadata={props.onExtractAiMetadata}
      onGetWorkflowRunDetail={props.onGetWorkflowRunDetail}
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
      onRecordPhotoMetadataAssertion={props.onRecordPhotoMetadataAssertion}
      onRunWorkflowOnAssets={props.onRunWorkflowOnAssets}
      onGetPhotoEditWorkspace={props.onGetPhotoEditWorkspace ?? defaultPhotoEditActions.getWorkspace}
      onPreviewPhotoEdit={props.onPreviewPhotoEdit ?? defaultPhotoEditActions.preview}
      onSavePhotoEdit={props.onSavePhotoEdit ?? defaultPhotoEditActions.save}
      onRenderPhotoEdit={props.onRenderPhotoEdit ?? defaultPhotoEditActions.render}
      onSavePhotoEditStyle={props.onSavePhotoEditStyle ?? defaultPhotoEditActions.saveStyle}
    />
  );
}

export function AppOverlays(props: AppOverlaysProps) {
  const { overlayAssets, selectedIndex, hasSelectedAsset } = useSinglePhotoOverlayState(props);

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
        onStartSimulationWorkflow={props.onStartSimulationWorkflow}
        folderHistory={props.folderHistory}
        selectedAssetIds={getLibrarySelectionAssetIds(props.librarySelection, props.assets)}
        onRunWorkflowOnAssets={props.onRunWorkflowOnAssets}
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
        testProviderKeyCommand={props.onTestProviderKey}
        saveProviderKey={props.onSaveProviderKey}
        deleteProviderKey={props.onDeleteProviderKey}
        getRedactedProviderKey={props.onGetRedactedProviderKey}
      />

      {hasSelectedAsset && (
        renderSinglePhotoView(props, overlayAssets, selectedIndex)
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
