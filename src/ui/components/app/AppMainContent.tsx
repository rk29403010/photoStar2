import { useEffect, useState } from 'react';
import type { Asset, Person, Album, GalleryTimelineSeek, LibraryStats } from '@contracts/core';
import type { DataStatsSnapshot, JobErrorSnapshot, RecentEventSnapshot, WorkflowRunListItem, WorkflowStatusSnapshot } from '@contracts/jobs';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import { buildStablePreviewAssets } from '@shared/utils/stablePreviewAssets';
import type { LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { LibraryView } from '../LibraryView';
import { PeopleView } from '../PeopleView';
import { DashboardView } from '../DashboardView';
import { AlbumsView } from '../AlbumsView';
import { WorkflowWorkspace } from '../workflows/WorkflowWorkspace';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import { GroupingDiagnosticsView } from '../group-diagnostics/GroupingDiagnosticsView';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { GalleryOrder } from '@ui/hooks/usePhotoLibrary.gallery';

interface AppMainContentProps {
  view: 'library' | 'people' | 'dashboard' | 'albums' | 'workflows' | 'groupDiagnostics';
  stats: LibraryStats | null;
  assets: Asset[];
  galleryTimelineSeek: GalleryTimelineSeek | null;
  people: Person[];
  status: string;
  backendReady: boolean;
  filterStack: LibraryFilter[];
  selectedAssetId: string | null;
  showInfoPanel: boolean;
  setShowInfoPanel: (show: boolean) => void;
  activeInfoTab: InfoTab;
  setActiveInfoTab: (tab: InfoTab) => void;
  libraryActive: boolean;
  showFaces: boolean;
  librarySelection: LibrarySelectionState;
  groupSimilarPhotos: boolean;
  showGroupIds: boolean;
  groupDiagnosticsReport: GroupDiagnosticsReport | null;
  isLoadingGroupDiagnostics: boolean;
  declusteredAssets: Set<string>;
  showRejected: boolean;
  rejectedAssets: Asset[];
  workflowStatus: WorkflowStatusSnapshot | null;
  dataStats: DataStatsSnapshot | null;
  recentEvents: RecentEventSnapshot[];
  workflowRuns: WorkflowRunListItem[];
  uiFeedEntries: UiFeedEntry[];
  ingestStatusMessage: string | null;
  hasMoreAssets: boolean;
  isLoadingMoreAssets: boolean;
  onLoadMoreAssets: () => Promise<void>;
  onGalleryOrderChange: (order: GalleryOrder) => void;
  onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
  onAssetClick: (id: string | null) => void;
  onEnsureAssetDetails: (assetId: string) => void;
  onUntagAsset: (assetId: string, personId: string) => void;
  onTagFilterChange: (tag: string) => void;
  onLibrarySelectionChange: (selection: LibrarySelectionState) => void;
  onGroupSimilarPhotosChange: (enabled: boolean) => void;
  onShowGroupIdsChange: (enabled: boolean) => void;
  onRefreshGroupDiagnostics: () => void;
  onPeopleFilter: (filter: LibraryFilter) => void;
  onPeopleSelectionChange: (count: number) => void;
  onRenamePerson: (id: string, name: string) => void;
  onMergePeople: (ids: string[], targetName: string) => void;
  onRefreshSystemJobs: () => void;
  onGetEventPayloadRaw: (eventId: string) => Promise<string>;
  onGetJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }) => Promise<JobErrorSnapshot>;
  onGetWorkflowVisualiser: (workflowId: string, runId?: string | null) => Promise<WorkflowVisualiserModel>;
  onRerunMissingFolderAiMetadata: (runId: string) => Promise<{ runId: string | null; assetCount: number }>;
  onGetAlbums: () => Promise<Album[]>;
  onCreateAlbum: (title: string, description?: string) => Promise<{ albumId: string }>;
  onDeleteAlbum: (id: string) => Promise<void>;
  onOpenAlbum: (albumId: string, title: string) => void;
  onHoverLibraryAssetChange: (asset: Asset | null) => void;
  onFlagPhotoDateCorrection: (input: PhotoDateCorrectionInput) => Promise<void>;
}

function getPanelStyle(active: boolean) {
  return {
    display: active ? 'flex' : 'none',
    flex: 1,
    minHeight: 0,
    flexDirection: 'column' as const,
  };
}

function useVisibleLibraryAssets(assets: Asset[], ingestStatusMessage: string | null) {
  const ingestActive = Boolean(ingestStatusMessage);
  const [visibleAssets, setVisibleAssets] = useState<Asset[]>(() => buildStablePreviewAssets([], assets, ingestActive));

  useEffect(() => {
    setVisibleAssets((previousAssets) => buildStablePreviewAssets(previousAssets, assets, ingestActive));
  }, [assets, ingestActive]);

  return visibleAssets;
}

function LibraryContentView(props: AppMainContentProps & { visibleLibraryAssets: Asset[]; activeFilter?: LibraryFilter }) {
  return (
    <div style={getPanelStyle(props.view === 'library')}>
      <LibraryView
        stats={props.stats}
        assets={props.visibleLibraryAssets}
        galleryTimelineSeek={props.galleryTimelineSeek}
        loading={props.status.includes('Initializing')}
        backendReady={props.backendReady}
        backendStatus={props.status}
        hasMoreAssets={props.hasMoreAssets}
        isLoadingMoreAssets={props.isLoadingMoreAssets}
        onLoadMoreAssets={props.onLoadMoreAssets}
        onGalleryOrderChange={props.onGalleryOrderChange}
        onGalleryTimelineSeek={props.onGalleryTimelineSeek}
        active={props.libraryActive}
        onAssetClick={props.onAssetClick}
        selectedAssetId={props.selectedAssetId}
        showInfoPanel={props.showInfoPanel}
        onShowInfoPanelChange={props.setShowInfoPanel}
        activeInfoTab={props.activeInfoTab}
        onActiveInfoTabChange={props.setActiveInfoTab}
        activeFilter={props.activeFilter}
        onTagFilterChange={props.onTagFilterChange}
        showFaces={props.showFaces}
        onEnsureAssetDetails={props.onEnsureAssetDetails}
        onUntagAsset={props.onUntagAsset}
        librarySelection={props.librarySelection}
        groupSimilarPhotos={props.groupSimilarPhotos}
        showGroupIds={props.showGroupIds}
        onLibrarySelectionChange={props.onLibrarySelectionChange}
        onGroupSimilarPhotosChange={props.onGroupSimilarPhotosChange}
        onShowGroupIdsChange={props.onShowGroupIdsChange}
        declusteredAssets={props.declusteredAssets}
        showRejected={props.showRejected}
        rejectedAssets={props.showRejected ? props.rejectedAssets : []}
        onHoverAssetChange={props.onHoverLibraryAssetChange}
        onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
      />
    </div>
  );
}

export function AppMainContent(props: AppMainContentProps) {
  const activeFilter = props.filterStack.length > 0 ? props.filterStack[props.filterStack.length - 1] : undefined;
  const visibleLibraryAssets = useVisibleLibraryAssets(props.assets, props.ingestStatusMessage);

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <LibraryContentView {...props} visibleLibraryAssets={visibleLibraryAssets} activeFilter={activeFilter} />

      {props.view === 'people' && (
        <PeopleView
          people={props.people}
          onFilter={props.onPeopleFilter}
          onSelectionChange={props.onPeopleSelectionChange}
          onRename={props.onRenamePerson}
          onMerge={props.onMergePeople}
        />
      )}

      {props.view === 'dashboard' && (
        <DashboardView
          workflowStatus={props.workflowStatus}
          dataStats={props.dataStats}
          recentEvents={props.recentEvents}
          workflowRuns={props.workflowRuns}
          uiFeedEntries={props.uiFeedEntries}
          refreshSystemJobs={props.onRefreshSystemJobs}
          onGetEventPayloadRaw={props.onGetEventPayloadRaw}
          onGetJobErrors={props.onGetJobErrors}
          loading={!props.backendReady}
        />
      )}

      {props.view === 'albums' && (
        <AlbumsView
          getAlbums={props.onGetAlbums}
          createAlbum={props.onCreateAlbum}
          deleteAlbum={props.onDeleteAlbum}
          onOpenAlbum={props.onOpenAlbum}
        />
      )}

      {props.view === 'workflows' && (
        <WorkflowWorkspace
          workflowId="folder_ingest_v1"
          onGetWorkflowVisualiser={props.onGetWorkflowVisualiser}
          onRerunMissingFolderAiMetadata={props.onRerunMissingFolderAiMetadata}
        />
      )}

      {props.view === 'groupDiagnostics' && (
        <GroupingDiagnosticsView
          report={props.groupDiagnosticsReport}
          loading={props.isLoadingGroupDiagnostics}
          onRefresh={props.onRefreshGroupDiagnostics}
          onAssetClick={(assetId) => props.onAssetClick(assetId)}
        />
      )}
    </div>
  );
}
