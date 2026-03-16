import { useEffect, useState } from 'react';
import type { Asset, Person, Album } from '@contracts/core';
import type { BackgroundJob, DataStatsSnapshot, JobErrorSnapshot, QueueStatusSnapshot, RecentEventSnapshot, WorkflowRunListItem } from '@contracts/jobs';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import { buildStablePreviewAssets } from '@shared/utils/stablePreviewAssets';
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
  librarySelection: Set<string>;
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
  onLibrarySelectionChange: (selection: Set<string>) => void;
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
  const {
    view, assets, people, status, backendReady, filterStack, selectedAssetId, libraryActive, showFaces,
    librarySelection, declusteredAssets, showRejected, rejectedAssets, jobs, systemJobs,
    queueStatus, dataStats, recentEvents, workflowRuns, isSystemPaused, hasMoreAssets, isLoadingMoreAssets,
    uiFeedEntries, ingestStatusMessage,
    onLoadMoreAssets, onAssetClick, onUntagAsset, onLibrarySelectionChange,
    onPeopleFilter, onPeopleSelectionChange, onRenamePerson, onMergePeople, onRefreshSystemJobs,
    onTogglePause, onStopJob, onGetEventPayloadRaw, onGetJobErrors, onSetModulePaused,
    onGetWorkflowVisualiser, onGetAlbums, onCreateAlbum, onDeleteAlbum, onOpenAlbum, onHoverLibraryAssetChange,
  } = props;

  const activeFilter = filterStack.length > 0 ? filterStack[filterStack.length - 1] : undefined;
  const visibleLibraryAssets = useVisibleLibraryAssets(assets, ingestStatusMessage);

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={getPanelStyle(view === 'library')}>
        <LibraryView
          assets={visibleLibraryAssets}
          loading={status.includes('Initializing')}
          backendReady={backendReady}
          backendStatus={status}
          hasMoreAssets={hasMoreAssets}
          isLoadingMoreAssets={isLoadingMoreAssets}
          onLoadMoreAssets={onLoadMoreAssets}
          active={libraryActive}
          onAssetClick={onAssetClick}
          selectedAssetId={selectedAssetId}
          activeFilter={activeFilter}
          showFaces={showFaces}
          onUntagAsset={onUntagAsset}
          librarySelection={librarySelection}
          onLibrarySelectionChange={onLibrarySelectionChange}
          declusteredAssets={declusteredAssets}
          showRejected={showRejected}
          rejectedAssets={showRejected ? rejectedAssets : []}
          onHoverAssetChange={onHoverLibraryAssetChange}
        />
      </div>

      {view === 'people' && (
        <PeopleView
          people={people}
          onFilter={onPeopleFilter}
          onSelectionChange={onPeopleSelectionChange}
          onRename={onRenamePerson}
          onMerge={onMergePeople}
        />
      )}

      {view === 'dashboard' && (
        <DashboardView
          jobs={jobs}
          systemJobs={systemJobs}
          queueStatus={queueStatus}
          dataStats={dataStats}
          recentEvents={recentEvents}
          workflowRuns={workflowRuns}
          uiFeedEntries={uiFeedEntries}
          refreshSystemJobs={onRefreshSystemJobs}
          isSystemPaused={isSystemPaused}
          onTogglePause={onTogglePause}
          onStopJob={onStopJob}
          onGetEventPayloadRaw={onGetEventPayloadRaw}
          onGetJobErrors={onGetJobErrors}
          onSetModulePaused={onSetModulePaused}
          loading={!backendReady}
        />
      )}

      {view === 'albums' && (
        <AlbumsView
          getAlbums={onGetAlbums}
          createAlbum={onCreateAlbum}
          deleteAlbum={onDeleteAlbum}
          onOpenAlbum={onOpenAlbum}
        />
      )}

      {view === 'workflows' && (
        <WorkflowWorkspace
          workflowId="folder_ingest_v1"
          onGetWorkflowVisualiser={onGetWorkflowVisualiser}
        />
      )}
    </div>
  );
}
