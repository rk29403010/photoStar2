import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import './App.css';
import { TopBar } from './components/TopBar';
import { LoadingScreen } from './components/LoadingScreen';
import { usePhotoLibrary } from './hooks/usePhotoLibrary';
import { AppFilterBar } from './components/app/AppFilterBar';
import { AppMainContent } from './components/app/AppMainContent';
import { AppStatusBar } from './components/app/AppStatusBar';
import { AppOverlays } from './components/app/AppOverlays';
import { AppNotifications } from './components/app/AppNotifications';
import { AppStatusRightSlot, ConnectionOverlayLayer, ErrorBanner } from './components/app/AppShellDecorations';
import { canUseNativeDirectoryPicker } from '@boundary/runtime/backend';
import type { LibraryFilter } from './hooks/usePhotoLibrary';
import type { BackgroundJob } from '@contracts/jobs';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import { buildCurrentPhotoStatus } from '@shared/utils/libraryGallery';
import {
  clearLibrarySelection,
  getLibrarySelectionCount,
  getLibrarySelectionPhotoIds,
  type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';
import { useAppUiState, type AppView } from './hooks/useAppRuntimeUi';
import { useGroupDiagnosticsView } from './hooks/useGroupDiagnosticsView';

const ACTIVE_OVERLAY_JOB_STATES = new Set<BackgroundJob['state']>([
  'queued',
  'starting',
  'running',
  'retrying',
]);

interface AppActionHandlers {
  shownAssetsCount: number;
  resetLibraryUi: () => void;
  handleViewChange: (next: AppView) => void;
  handleRefresh: () => void;
  handleDeclusterSelection: (personId: string) => void;
  handleToggleRejected: (personId: string) => void;
  handleFilterBack: () => void;
  handleClearAllFilters: () => void;
  handleUntagAsset: (assetId: string, personId: string) => void;
  handlePeopleFilter: (filter: LibraryFilter) => void;
  handleOpenAlbum: (albumId: string, albumTitle: string) => void;
  handleScan: (specificPath?: string) => Promise<void>;
  handleOverlayRefresh: () => void;
  handleFaceClick: (personId: string, personName: string) => void;
  handleOpenSettingsFromPhoto: () => void;
}

interface UseAppActionHandlersParams {
  assets: ReturnType<typeof usePhotoLibrary>['assets'];
  filterStack: LibraryFilter[];
  showRejected: boolean;
  setShowRejected: (showRejected: boolean | ((prev: boolean) => boolean)) => void;
  librarySelection: LibrarySelectionState;
  setLibrarySelection: (selection: LibrarySelectionState) => void;
  declusteredAssets: Set<string>;
  setDeclusteredAssets: Dispatch<SetStateAction<Set<string>>>;
  actions: ReturnType<typeof usePhotoLibrary>['actions'];
  setView: (view: AppView) => void;
  setPeopleSelectionCount: (count: number) => void;
  setSelectedAssetId: (assetId: string | null) => void;
  setShowSettings: (show: boolean) => void;
}

interface UseLibraryFilterHandlersParams {
  filterStack: LibraryFilter[];
  showRejected: boolean;
  setShowRejected: (showRejected: boolean | ((prev: boolean) => boolean)) => void;
  librarySelection: LibrarySelectionState;
  setLibrarySelection: (selection: LibrarySelectionState) => void;
  declusteredAssets: Set<string>;
  setDeclusteredAssets: Dispatch<SetStateAction<Set<string>>>;
  actions: ReturnType<typeof usePhotoLibrary>['actions'];
  setView: (view: AppView) => void;
  setPeopleSelectionCount: (count: number) => void;
}

interface UseLibraryFilterStateResetParams {
  actions: ReturnType<typeof usePhotoLibrary>['actions'];
  declusteredAssets: Set<string>;
  filterStack: LibraryFilter[];
  librarySelection: LibrarySelectionState;
  setDeclusteredAssets: Dispatch<SetStateAction<Set<string>>>;
  setLibrarySelection: (selection: LibrarySelectionState) => void;
  setPeopleSelectionCount: (count: number) => void;
  setShowRejected: (showRejected: boolean | ((prev: boolean) => boolean)) => void;
  setView: (view: AppView) => void;
  showRejected: boolean;
}

async function requestScanPath(): Promise<string | null> {
  if (canUseNativeDirectoryPicker()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    return selected && typeof selected === 'string' ? selected : null;
  }

  return window.prompt('Enter absolute path to scan (e.g. C:/Users/robin/Photos):');
}

function useSelectionRecovery(
  assets: ReturnType<typeof usePhotoLibrary>['assets'],
  selectedAssetId: string | null,
  setSelectedAssetId: (assetId: string | null) => void,
  setStatusMessage: Dispatch<SetStateAction<string | null>>
) {
  useEffect(() => {
    if (!selectedAssetId || assets.length === 0) {return;}
    if (assets.some((asset) => asset.id === selectedAssetId)) {return;}

    setSelectedAssetId(null);
    const showTimer = window.setTimeout(() => setStatusMessage('Previously selected photo is no longer available.'), 0);
    const clearTimer = window.setTimeout(() => setStatusMessage(null), 5000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(clearTimer);
    };
  }, [assets, selectedAssetId, setSelectedAssetId, setStatusMessage]);
}

function useAppActionHandlers(params: UseAppActionHandlersParams): AppActionHandlers {
  const {
    assets,
    filterStack,
    showRejected,
    setShowRejected,
    librarySelection,
    setLibrarySelection,
    declusteredAssets,
    setDeclusteredAssets,
    actions,
    setView,
    setPeopleSelectionCount,
    setSelectedAssetId,
    setShowSettings,
  } = params;

  const shownAssetsCount = useMemo(() => {
    return filterStack.length > 0 ? assets.filter((asset) => Boolean(asset.preview_path)).length : -1;
  }, [assets, filterStack]);
  const filterHandlers = useLibraryFilterHandlers({
    filterStack,
    showRejected,
    setShowRejected,
    librarySelection,
    setLibrarySelection,
    declusteredAssets,
    setDeclusteredAssets,
    actions,
    setView,
    setPeopleSelectionCount,
  });

  const handleScan = useCallback(async (specificPath?: string) => {
    const path = specificPath ?? await requestScanPath();
    if (path) {
      void actions.scanLibrary(path);
    }
  }, [actions]);

  const handleOverlayRefresh = useCallback(() => {
    actions.refreshLibrary();
    actions.refreshPeople();
  }, [actions]);

  const handleFaceClick = useCallback((personId: string, personName: string) => {
    actions.pushFilter({ type: 'person_any', personIds: [personId], description: personName });
    setSelectedAssetId(null);
    setView('library');
  }, [actions, setSelectedAssetId, setView]);

  const handleOpenSettingsFromPhoto = useCallback(() => {
    setSelectedAssetId(null);
    setShowSettings(true);
  }, [setSelectedAssetId, setShowSettings]);

  return {
    shownAssetsCount,
    ...filterHandlers,
    handleScan,
    handleOverlayRefresh,
    handleFaceClick,
    handleOpenSettingsFromPhoto,
  };
}

function useLibraryFilterHandlers(params: UseLibraryFilterHandlersParams) {
  const {
    filterStack,
    showRejected,
    setShowRejected,
    librarySelection,
    setLibrarySelection,
    declusteredAssets,
    setDeclusteredAssets,
    actions,
    setView,
    setPeopleSelectionCount,
  } = params;

  const stateResetHandlers = useLibraryFilterStateResetHandlers({
    actions,
    declusteredAssets,
    filterStack,
    librarySelection,
    setDeclusteredAssets,
    setLibrarySelection,
    setPeopleSelectionCount,
    setShowRejected,
    setView,
    showRejected,
  });

  const handleFilterBack = useCallback(() => {
    if (filterStack.length <= 1) {
      setView('people');
      actions.clearFilters();
    } else {
      actions.popFilter();
    }
    stateResetHandlers.resetLibraryUi();
  }, [actions, filterStack.length, setView, stateResetHandlers]);

  const handleClearAllFilters = useCallback(() => {
    actions.clearFilters();
    setView('people');
    stateResetHandlers.resetLibraryUi();
  }, [actions, setView, stateResetHandlers]);

  return {
    ...stateResetHandlers,
    handleFilterBack,
    handleClearAllFilters,
  };
}

function useLibraryFilterStateResetHandlers(params: UseLibraryFilterStateResetParams) {
  const {
    actions,
    declusteredAssets,
    librarySelection,
    setDeclusteredAssets,
    setLibrarySelection,
    setPeopleSelectionCount,
    setShowRejected,
    setView,
    showRejected,
  } = params;

  const resetLibraryUi = useCallback(() => {
    setDeclusteredAssets(new Set());
    setLibrarySelection(clearLibrarySelection());
    setShowRejected(false);
    actions.getRejectedAssetsForPerson(null);
  }, [actions, setDeclusteredAssets, setLibrarySelection, setShowRejected]);

  const handleViewChange = useCallback((next: AppView) => {
    actions.clearFilters();
    setDeclusteredAssets(next === 'library' ? new Set() : declusteredAssets);
    setLibrarySelection(clearLibrarySelection());
    setView(next);
  }, [actions, declusteredAssets, setDeclusteredAssets, setLibrarySelection, setView]);

  const handleRefresh = useCallback(() => {
    setDeclusteredAssets(new Set());
    setShowRejected(false);
    actions.getRejectedAssetsForPerson(null);
    actions.refreshLibrary();
    actions.refreshPeople();
  }, [actions, setDeclusteredAssets, setShowRejected]);

  const handleDeclusterSelection = useCallback((personId: string) => {
    getLibrarySelectionPhotoIds(librarySelection).forEach((assetId) => {
      void actions.isolatePersonAsset(assetId, personId);
    });
    setDeclusteredAssets((prev) => {
      const next = new Set(prev);
      getLibrarySelectionPhotoIds(librarySelection).forEach((id) => next.add(id));
      return next;
    });
    setLibrarySelection(clearLibrarySelection());
  }, [actions, librarySelection, setDeclusteredAssets, setLibrarySelection]);

  const handleToggleRejected = useCallback((personId: string) => {
    actions.getRejectedAssetsForPerson(showRejected ? null : personId);
    setShowRejected((prev) => !prev);
  }, [actions, setShowRejected, showRejected]);

  const handleUntagAsset = useCallback((assetId: string, personId: string) => {
    void actions.isolatePersonAsset(assetId, personId);
    setDeclusteredAssets((prev) => new Set(prev).add(assetId));
  }, [actions, setDeclusteredAssets]);

  const handlePeopleFilter = useCallback((filter: LibraryFilter) => {
    actions.pushFilter(filter);
    setView('library');
    setPeopleSelectionCount(0);
  }, [actions, setPeopleSelectionCount, setView]);

  const handleOpenAlbum = useCallback((albumId: string, albumTitle: string) => {
    actions.pushFilter({ type: 'album', albumId, description: albumTitle, personIds: [] });
    setView('library');
  }, [actions, setView]);

  return {
    resetLibraryUi,
    handleViewChange,
    handleRefresh,
    handleDeclusterSelection,
    handleToggleRejected,
    handleUntagAsset,
    handlePeopleFilter,
    handleOpenAlbum,
  };
}

function useAppAppearance(theme: string, animationsEnabled: boolean) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('no-animations', !animationsEnabled);
  }, [theme, animationsEnabled]);
}

function getShellStyle(uiBlocked: boolean) {
  if (!uiBlocked) {
    return { display: 'flex', flexDirection: 'column' as const, flex: 1, minHeight: 0 };
  }

  return {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    opacity: 0.38,
    filter: 'grayscale(0.9)',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  };
}

const CONNECTION_UNAVAILABLE_STATUS_PREFIXES = ['Connecting to backend service', 'Reconnecting to backend service', 'Waiting for backend service to become ready', 'Backend service unavailable', 'Backend service failed to start'] as const;

function isConnectionUnavailableStatus(status: string) {
  return CONNECTION_UNAVAILABLE_STATUS_PREFIXES.some((prefix) => status.startsWith(prefix));
}

function getConnectionUiState(status: string, error: string | null) {
  const backendReady = !isConnectionUnavailableStatus(status);
  if (backendReady) {return { backendReady, shellStyle: getShellStyle(false), connectionOverlay: null };}

  return {
    backendReady,
    shellStyle: getShellStyle(true),
    connectionOverlay: {
      title: 'Backend Service Unavailable',
      message: error ?? 'Attempting to restore the backend service connection...',
      tone: error ? 'warning' as const : 'info' as const,
    },
  };
}

function useStartupConsoleTimeline(status: string, error: string | null, hasCompletedInitialSync: boolean) {
  const startedAtRef = useRef<number | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const hasLoggedInitialSyncRef = useRef(false);

  const getElapsedMs = useCallback(() => {
    if (startedAtRef.current === null) {
      startedAtRef.current = performance.now();
      return 0;
    }
    return Math.round(performance.now() - startedAtRef.current);
  }, []);

  useEffect(() => {
    if (lastStatusRef.current === status) {return;}
    lastStatusRef.current = status;
    console.info(`[PhotoStar timeline +${getElapsedMs()}ms] ${status}`);
  }, [getElapsedMs, status]);

  useEffect(() => {
    if (!error || lastErrorRef.current === error) {
      lastErrorRef.current = error;
      return;
    }

    lastErrorRef.current = error;
    console.warn(`[PhotoStar timeline +${getElapsedMs()}ms] ${error}`);
  }, [error, getElapsedMs]);

  useEffect(() => {
    if (!hasCompletedInitialSync || hasLoggedInitialSyncRef.current) {return;}
    hasLoggedInitialSyncRef.current = true;
    console.info(`[PhotoStar timeline +${getElapsedMs()}ms] Initial sync complete.`);
  }, [getElapsedMs, hasCompletedInitialSync]);
}

function getActiveOverlayJobs(jobs: BackgroundJob[]) {
  return jobs.filter((job) => ACTIVE_OVERLAY_JOB_STATES.has(job.state));
}

interface LoadedAppShellProps {
  photoLibrary: ReturnType<typeof usePhotoLibrary>;
  handlers: AppActionHandlers;
  totalPhotoCount: number;
  activeOverlayJobs: BackgroundJob[];
  handleOverlayStopJob: (job: BackgroundJob) => void;
  connectionUiState: ReturnType<typeof getConnectionUiState>;
  groupDiagnosticsReport: GroupDiagnosticsReport | null;
  isLoadingGroupDiagnostics: boolean;
  onOpenGroupDiagnostics: () => void;
  onRefreshGroupDiagnostics: () => void;
  uiState: ReturnType<typeof useAppUiState>;
}

function LoadedAppShell({
  photoLibrary,
  handlers,
  totalPhotoCount,
  activeOverlayJobs,
  handleOverlayStopJob,
  connectionUiState,
  groupDiagnosticsReport,
  isLoadingGroupDiagnostics,
  onOpenGroupDiagnostics,
  onRefreshGroupDiagnostics,
  uiState,
}: LoadedAppShellProps) {
  const {
    error,
    status,
    assets,
    people,
    rejectedAssets,
    jobs,
    systemJobs,
    queueStatus,
    dataStats,
    recentEvents,
    workflowRuns,
    folderHistory,
    uiFeedEntries,
    ingestStatusMessage,
    isSystemPaused,
    actions,
    filterStack,
    notifications,
    dismissNotification,
    hasMoreAssets,
    isLoadingMoreAssets,
  } = photoLibrary;
  const { backendReady, shellStyle, connectionOverlay } = connectionUiState;

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', padding: 0, background: '#000', color: '#eee' }}>
      {error && backendReady && <ErrorBanner error={error} />}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={shellStyle}>
          <TopBar view={uiState.view} setView={handlers.handleViewChange} onOpenActions={() => uiState.setShowActions(true)} />
          <AppFilterBar view={uiState.view} filterStack={filterStack} librarySelection={uiState.librarySelection} showRejected={uiState.showRejected} onDeclusterSelection={handlers.handleDeclusterSelection} onClearSelection={() => uiState.setLibrarySelection(clearLibrarySelection())} onToggleRejected={handlers.handleToggleRejected} onBack={handlers.handleFilterBack} onClearAll={handlers.handleClearAllFilters} />
          <AppMainContent view={uiState.view} assets={assets} libraryActive={uiState.view === 'library'} people={people} status={status} backendReady={backendReady} filterStack={filterStack} selectedAssetId={uiState.selectedAssetId} showFaces={false} librarySelection={uiState.librarySelection} groupSimilarPhotos={uiState.groupSimilarPhotos} showGroupIds={uiState.showGroupIds} groupDiagnosticsReport={groupDiagnosticsReport} isLoadingGroupDiagnostics={isLoadingGroupDiagnostics} declusteredAssets={uiState.declusteredAssets} showRejected={uiState.showRejected} rejectedAssets={rejectedAssets} jobs={jobs} systemJobs={systemJobs} queueStatus={queueStatus} dataStats={dataStats} recentEvents={recentEvents} workflowRuns={workflowRuns} uiFeedEntries={uiFeedEntries} ingestStatusMessage={ingestStatusMessage} isSystemPaused={isSystemPaused} hasMoreAssets={hasMoreAssets} isLoadingMoreAssets={isLoadingMoreAssets} onLoadMoreAssets={actions.loadMoreAssets} onAssetClick={uiState.setSelectedAssetId} onUntagAsset={handlers.handleUntagAsset} onLibrarySelectionChange={uiState.setLibrarySelection} onGroupSimilarPhotosChange={uiState.setGroupSimilarPhotos} onShowGroupIdsChange={uiState.setShowGroupIds} onRefreshGroupDiagnostics={onRefreshGroupDiagnostics} onPeopleFilter={handlers.handlePeopleFilter} onPeopleSelectionChange={uiState.setPeopleSelectionCount} onRenamePerson={actions.renamePerson} onMergePeople={actions.mergePeople} onRefreshSystemJobs={actions.refreshSystemJobs} onTogglePause={actions.toggleSystemPause} onStopJob={actions.stopJob} onGetEventPayloadRaw={actions.getEventPayloadRaw} onGetJobErrors={actions.getJobErrors} onSetModulePaused={actions.setModulePaused} onGetWorkflowVisualiser={actions.getWorkflowVisualiser} onGetAlbums={actions.getAlbums} onCreateAlbum={actions.createAlbum} onDeleteAlbum={actions.deleteAlbum} onOpenAlbum={handlers.handleOpenAlbum} onHoverLibraryAssetChange={(asset) => uiState.setHoveredLibraryPhoto(asset ? buildCurrentPhotoStatus(asset) : null)} />
          <AppStatusBar statusMessage={uiState.statusMessage} activityMessage={ingestStatusMessage} status={status} view={uiState.view} librarySelectionCount={getLibrarySelectionCount(uiState.librarySelection)} shownAssetsCount={handlers.shownAssetsCount} peopleSelectionCount={uiState.peopleSelectionCount} totalPhotoCount={totalPhotoCount} peopleCount={people.length} currentPhoto={uiState.view === 'library' ? uiState.hoveredLibraryPhoto : null} rightSlot={<AppStatusRightSlot isTaskDrawerMinimized={uiState.isTaskDrawerMinimized} activeOverlayJobCount={activeOverlayJobs.length} onRestoreTaskDrawer={() => uiState.setIsTaskDrawerMinimized(false)} devRuntimeImpact={uiState.devRuntimeImpact} />} />
            <AppOverlays assets={assets} selectedAssetId={uiState.selectedAssetId} setSelectedAssetId={uiState.setSelectedAssetId} showActions={uiState.showActions} setShowActions={uiState.setShowActions} showSettings={uiState.showSettings} setShowSettings={uiState.setShowSettings} showInfoPanel={uiState.showInfoPanel} setShowInfoPanel={uiState.setShowInfoPanel} activeInfoTab={uiState.activeInfoTab} setActiveInfoTab={uiState.setActiveInfoTab} jobs={activeOverlayJobs} folderHistory={folderHistory} onScan={handlers.handleScan} onPreviews={actions.generatePreviews} onDetect={actions.detectFaces} onCluster={actions.clusterFaces} onScanSensitive={actions.scanSensitive} onScanSensitiveAll={actions.scanSensitiveAll} onExtractAiMetadata={actions.extractAiMetadata} onRefresh={handlers.handleOverlayRefresh} onResetFaces={actions.resetFaces} onResetAll={actions.resetLibrary} onFactoryReset={actions.factoryResetLibrary} onResetGroupingData={actions.resetGroupingData} onStopScan={actions.stopScan} onBuildGroups={actions.buildGroups} onBuildBursts={actions.buildBursts} onOpenGroupDiagnostics={onOpenGroupDiagnostics} onGetSetting={actions.getSetting} onSetSetting={actions.setSetting} onOpenWorkflowVisualiser={() => uiState.setView('workflows')} theme={uiState.theme} setTheme={uiState.setTheme} animationsEnabled={uiState.animationsEnabled} setAnimationsEnabled={uiState.setAnimationsEnabled} onPrioritize={actions.prioritizeAsset} onFaceClick={handlers.handleFaceClick} onIsolateFace={actions.isolateFace} onSetSensitivity={actions.setSensitivity} onOpenSettingsFromPhoto={handlers.handleOpenSettingsFromPhoto} onGetGroupOrbit={actions.getGroupOrbit} onSetCanonical={actions.setCanonical} onExplodeGroup={actions.explodeGroup} onStopJob={handleOverlayStopJob} isTaskDrawerMinimized={uiState.isTaskDrawerMinimized} onTaskDrawerMinimizedChange={uiState.setIsTaskDrawerMinimized} />
        </div>
        <ConnectionOverlayLayer connectionOverlay={connectionOverlay} status={status} />
      </div>
      <AppNotifications notifications={notifications} dismissNotification={dismissNotification} />
    </div>
  );
}

export default function App() {
  const photoLibrary = usePhotoLibrary();
  const { status, error, hasCompletedInitialSync, stats, assets, jobs, actions, filterStack } = photoLibrary;
  const uiState = useAppUiState(actions.getDevRuntimeImpact);
  const {
    setView,
    selectedAssetId,
    setSelectedAssetId,
    theme,
    animationsEnabled,
    setShowSettings,
    setPeopleSelectionCount,
    librarySelection,
    setLibrarySelection,
    groupSimilarPhotos,
    declusteredAssets,
    setDeclusteredAssets,
    showRejected,
    setShowRejected,
    setStatusMessage,
    setIsTaskDrawerMinimized,
  } = uiState;
  const syncGroupSimilarPhotos = actions.setGroupSimilarPhotos;
  const { groupDiagnosticsReport, isLoadingGroupDiagnostics, loadGroupDiagnosticsReport } = useGroupDiagnosticsView({
    getGroupDiagnosticsReport: actions.getGroupDiagnosticsReport,
    view: uiState.view,
  });

  useSelectionRecovery(assets, selectedAssetId, setSelectedAssetId, setStatusMessage);
  const handlers = useAppActionHandlers({ assets, filterStack, showRejected, setShowRejected, librarySelection, setLibrarySelection, declusteredAssets, setDeclusteredAssets, actions, setView, setPeopleSelectionCount, setSelectedAssetId, setShowSettings });

  useEffect(() => {
    syncGroupSimilarPhotos(groupSimilarPhotos);
  }, [groupSimilarPhotos, syncGroupSimilarPhotos]);

  const loadAssetDetails = actions.loadAssetDetails;
  const activeOverlayJobs = useMemo(() => getActiveOverlayJobs(jobs), [jobs]);
  const handleOverlayStopJob = useCallback((job: BackgroundJob) => {
    if (job.state === 'queued') {
      void actions.removeQueuedJob(job.id);
      return;
    }

    void actions.stopJob(job.id);
  }, [actions]);

  useEffect(() => {
    if (!selectedAssetId) {return;}
    void loadAssetDetails(selectedAssetId);
  }, [loadAssetDetails, selectedAssetId]);

  useAppAppearance(theme, animationsEnabled);
  useStartupConsoleTimeline(status, error, hasCompletedInitialSync);

  useEffect(() => {
    if (activeOverlayJobs.length === 0) {
      setIsTaskDrawerMinimized(false);
    }
  }, [activeOverlayJobs.length, setIsTaskDrawerMinimized]);

  if (!hasCompletedInitialSync) {return <LoadingScreen status={status} />;}

  return <LoadedAppShell
    photoLibrary={photoLibrary}
    handlers={handlers}
    totalPhotoCount={stats?.count ?? 0}
    activeOverlayJobs={activeOverlayJobs}
    handleOverlayStopJob={handleOverlayStopJob}
    connectionUiState={getConnectionUiState(status, error)}
    groupDiagnosticsReport={groupDiagnosticsReport}
    isLoadingGroupDiagnostics={isLoadingGroupDiagnostics}
    onOpenGroupDiagnostics={() => {
      uiState.setView('groupDiagnostics');
      void loadGroupDiagnosticsReport();
    }}
    onRefreshGroupDiagnostics={() => {
      void loadGroupDiagnosticsReport();
    }}
    uiState={uiState}
  />;
}
