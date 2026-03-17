import { useEffect, useState } from 'react';
import type { Asset, Person, Album } from '@contracts/core';
import type { BackgroundJob, DataStatsSnapshot, JobErrorSnapshot, QueueStatusSnapshot, RecentEventSnapshot, WorkflowRunListItem } from '@contracts/jobs';
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

interface AppMainContentProps {
  view: 'library' | 'people' | 'dashboard' | 'albums' | 'workflows';
  assets: Asset[];
  people: Person[];
  status: string;
  backendReady: boolean;
  filterStack: LibraryFilter[];
  selectedAssetId: string | null;
  libraryActive: boolean;
  showFaces: boolean;
  librarySelection: LibrarySelectionState;
  groupSimilarPhotos: boolean;
  declusteredAssets: Set<string>;
  showRejected: boolean;
  rejectedAssets: Asset[];
  jobs: BackgroundJob[];
  systemJobs: BackgroundJob[];
  queueStatus: QueueStatusSnapshot | null;
  dataStats: DataStatsSnapshot | null;
  recentEvents: RecentEventSnapshot[];
  workflowRuns: WorkflowRunListItem[];
  uiFeedEntries: UiFeedEntry[];
  ingestStatusMessage: string | null;
  isSystemPaused: boolean;
  hasMoreAssets: boolean;
  isLoadingMoreAssets: boolean;
  onLoadMoreAssets: () => Promise<void>;
  onAssetClick: (id: string | null) => void;
  onUntagAsset: (assetId: string, personId: string) => void;
  onLibrarySelectionChange: (selection: LibrarySelectionState) => void;
  onGroupSimilarPhotosChange: (enabled: boolean) => void;
  onPeopleFilter: (filter: LibraryFilter) => void;
  onPeopleSelectionChange: (count: number) => void;
  onRenamePerson: (id: string, name: string) => void;
  onMergePeople: (ids: string[], targetName: string) => void;
  onRefreshSystemJobs: () => void;
  onTogglePause: () => void;
  onStopJob: (id: string) => void;
  onGetEventPayloadRaw: (eventId: string) => Promise<string>;
  onGetJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }) => Promise<JobErrorSnapshot>;
  onSetModulePaused: (moduleId: string, paused: boolean) => void;
  onGetWorkflowVisualiser: (workflowId: string, runId?: string | null) => Promise<WorkflowVisualiserModel>;
  onGetAlbums: () => Promise<Album[]>;
  onCreateAlbum: (title: string, description?: string) => Promise<{ albumId: string }>;
  onDeleteAlbum: (id: string) => Promise<void>;
  onOpenAlbum: (albumId: string, title: string) => void;
  onHoverLibraryAssetChange: (asset: Asset | null) => void;
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

export function AppMainContent(props: AppMainContentProps) {
  const activeFilter = props.filterStack.length > 0 ? props.filterStack[props.filterStack.length - 1] : undefined;
  const visibleLibraryAssets = useVisibleLibraryAssets(props.assets, props.ingestStatusMessage);

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={getPanelStyle(props.view === 'library')}>
        <LibraryView
          assets={visibleLibraryAssets}
          loading={props.status.includes('Initializing')}
          backendReady={props.backendReady}
          backendStatus={props.status}
          hasMoreAssets={props.hasMoreAssets}
          isLoadingMoreAssets={props.isLoadingMoreAssets}
          onLoadMoreAssets={props.onLoadMoreAssets}
          active={props.libraryActive}
          onAssetClick={props.onAssetClick}
          selectedAssetId={props.selectedAssetId}
          activeFilter={activeFilter}
          showFaces={props.showFaces}
          onUntagAsset={props.onUntagAsset}
          librarySelection={props.librarySelection}
          groupSimilarPhotos={props.groupSimilarPhotos}
          onLibrarySelectionChange={props.onLibrarySelectionChange}
          onGroupSimilarPhotosChange={props.onGroupSimilarPhotosChange}
          declusteredAssets={props.declusteredAssets}
          showRejected={props.showRejected}
          rejectedAssets={props.showRejected ? props.rejectedAssets : []}
          onHoverAssetChange={props.onHoverLibraryAssetChange}
        />
      </div>

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
          jobs={props.jobs}
          systemJobs={props.systemJobs}
          queueStatus={props.queueStatus}
          dataStats={props.dataStats}
          recentEvents={props.recentEvents}
          workflowRuns={props.workflowRuns}
          uiFeedEntries={props.uiFeedEntries}
          refreshSystemJobs={props.onRefreshSystemJobs}
          isSystemPaused={props.isSystemPaused}
          onTogglePause={props.onTogglePause}
          onStopJob={props.onStopJob}
          onGetEventPayloadRaw={props.onGetEventPayloadRaw}
          onGetJobErrors={props.onGetJobErrors}
          onSetModulePaused={props.onSetModulePaused}
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
        />
      )}
    </div>
  );
}
