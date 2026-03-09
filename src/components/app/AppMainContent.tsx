import type { Asset, Person, Album } from '../../../shared/types/core';
import type { BackgroundJob, DataStatsSnapshot, JobErrorSnapshot, QueueStatusSnapshot, RecentEventSnapshot } from '../../../shared/types/jobs';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { LibraryView } from '../LibraryView';
import { PeopleView } from '../PeopleView';
import { DashboardView } from '../DashboardView';
import { AlbumsView } from '../AlbumsView';

interface AppMainContentProps {
  view: 'library' | 'people' | 'dashboard' | 'albums';
  assets: Asset[];
  people: Person[];
  status: string;
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
  isSystemPaused: boolean;
  hasMoreAssets: boolean;
  isLoadingMoreAssets: boolean;
  onLoadMoreAssets: () => Promise<void>;
  onAssetClick: (id: string | null) => void;
  onUntagAsset: (assetId: string, personId: string) => void;
  onSetSensitivity: (assetId: string, status: string | null) => void;
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
  onGetAlbums: () => Promise<Album[]>;
  onCreateAlbum: (title: string, description?: string) => Promise<{ albumId: string }>;
  onDeleteAlbum: (id: string) => Promise<void>;
  onOpenAlbum: (albumId: string, title: string) => void;
}

function getPanelStyle(active: boolean) {
  return {
    display: active ? 'flex' : 'none',
    flex: 1,
    minHeight: 0,
    flexDirection: 'column' as const,
  };
}

export function AppMainContent(props: AppMainContentProps) {
  const {
    view, assets, people, status, filterStack, selectedAssetId, libraryActive, showFaces,
    librarySelection, declusteredAssets, showRejected, rejectedAssets, jobs, systemJobs,
    queueStatus, dataStats, recentEvents, isSystemPaused, hasMoreAssets, isLoadingMoreAssets,
    onLoadMoreAssets, onAssetClick, onUntagAsset, onSetSensitivity, onLibrarySelectionChange,
    onPeopleFilter, onPeopleSelectionChange, onRenamePerson, onMergePeople, onRefreshSystemJobs,
    onTogglePause, onStopJob, onGetEventPayloadRaw, onGetJobErrors, onSetModulePaused,
    onGetAlbums, onCreateAlbum, onDeleteAlbum, onOpenAlbum,
  } = props;

  const activeFilter = filterStack.length > 0 ? filterStack[filterStack.length - 1] : undefined;

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={getPanelStyle(view === 'library')}>
        <LibraryView
          assets={assets.filter((asset) => Boolean(asset.preview_path))}
          loading={status.includes('Initializing')}
          backendReady={status.startsWith('Ready')}
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
          onSetSensitivity={onSetSensitivity}
          librarySelection={librarySelection}
          onLibrarySelectionChange={onLibrarySelectionChange}
          declusteredAssets={declusteredAssets}
          showRejected={showRejected}
          rejectedAssets={showRejected ? rejectedAssets : []}
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
          refreshSystemJobs={onRefreshSystemJobs}
          isSystemPaused={isSystemPaused}
          onTogglePause={onTogglePause}
          onStopJob={onStopJob}
          onGetEventPayloadRaw={onGetEventPayloadRaw}
          onGetJobErrors={onGetJobErrors}
          onSetModulePaused={onSetModulePaused}
          loading={!status.startsWith('Ready')}
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
    </div>
  );
}
