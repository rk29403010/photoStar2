import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import './App.css';
import { TopBar } from './components/TopBar';
import { LoadingScreen } from './components/LoadingScreen';
import { usePhotoLibrary } from './hooks/usePhotoLibrary';
import { usePersistedState } from './hooks/usePersistedState';
import { AppFilterBar } from './components/app/AppFilterBar';
import { AppMainContent } from './components/app/AppMainContent';
import { AppStatusBar } from './components/app/AppStatusBar';
import { AppOverlays } from './components/app/AppOverlays';
import { AppNotifications } from './components/app/AppNotifications';
import { AppStatusRightSlot, ConnectionOverlayLayer, ErrorBanner } from './components/app/AppShellDecorations';
import { canUseNativeDirectoryPicker } from './config/backend';
import type { LibraryFilter } from './hooks/usePhotoLibrary';
import type { BackgroundJob } from '../shared/types/jobs';

type AppView = 'library' | 'people' | 'dashboard' | 'albums';
type InfoTab = 'file' | 'analysis' | 'people' | 'json';

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
  librarySelection: Set<string>;
  setLibrarySelection: (selection: Set<string>) => void;
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
  librarySelection: Set<string>;
  setLibrarySelection: (selection: Set<string>) => void;
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
  librarySelection: Set<string>;
  setDeclusteredAssets: Dispatch<SetStateAction<Set<string>>>;
  setLibrarySelection: (selection: Set<string>) => void;
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
    setLibrarySelection(new Set());
    setShowRejected(false);
    actions.getRejectedAssetsForPerson(null);
  }, [actions, setDeclusteredAssets, setLibrarySelection, setShowRejected]);

  const handleViewChange = useCallback((next: AppView) => {
    actions.clearFilters();
    setDeclusteredAssets(next === 'library' ? new Set() : declusteredAssets);
    setLibrarySelection(new Set());
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
    Array.from(librarySelection).forEach((assetId) => {
      void actions.isolatePersonAsset(assetId, personId);
    });
    setDeclusteredAssets((prev) => {
      const next = new Set(prev);
      librarySelection.forEach((id) => next.add(id));
      return next;
    });
    setLibrarySelection(new Set());
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

const CONNECTION_UNAVAILABLE_STATUS_PREFIXES = [
  'Connecting to sidecar',
  'Reconnecting to sidecar',
  'Waiting for sidecar to start',
  'Sidecar unavailable',
  'Sidecar failed to start',
] as const;

function isConnectionUnavailableStatus(status: string) {
  return CONNECTION_UNAVAILABLE_STATUS_PREFIXES.some((prefix) => status.startsWith(prefix));
}

function getConnectionUiState(status: string, error: string | null) {
  const backendReady = !isConnectionUnavailableStatus(status);
  if (backendReady) {
    return { backendReady, shellStyle: getShellStyle(false), connectionOverlay: null };
  }

  return {
    backendReady,
    shellStyle: getShellStyle(true),
    connectionOverlay: {
      title: 'Sidecar Unavailable',
      message: error ?? 'Attempting to restore the sidecar connection...',
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

export default function App() {
  const photoLibrary = usePhotoLibrary();
  const { status, error, hasCompletedInitialSync, hasMoreAssets, isLoadingMoreAssets, stats, assets, people, rejectedAssets, jobs, systemJobs, queueStatus, dataStats, recentEvents, folderHistory, isSystemPaused, actions, filterStack, notifications, dismissNotification } = photoLibrary;
  const [view, setView] = usePersistedState<AppView>('ps_view', 'library');
  const [selectedAssetId, setSelectedAssetId] = usePersistedState<string | null>('ps_selected_asset', null);
  const [showInfoPanel, setShowInfoPanel] = usePersistedState<boolean>('ps_info_panel_open', false);
  const [activeInfoTab, setActiveInfoTab] = usePersistedState<InfoTab>('ps_info_tab', 'file');
  const [theme, setTheme] = usePersistedState<string>('ps_theme', 'dark');
  const [animationsEnabled, setAnimationsEnabled] = usePersistedState<boolean>('ps_animations', true);
  const [showActions, setShowActions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [peopleSelectionCount, setPeopleSelectionCount] = useState(0);
  const [librarySelection, setLibrarySelection] = useState<Set<string>>(new Set());
  const [declusteredAssets, setDeclusteredAssets] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isTaskDrawerMinimized, setIsTaskDrawerMinimized] = useState(false);

  useSelectionRecovery(assets, selectedAssetId, setSelectedAssetId, setStatusMessage);
  const handlers = useAppActionHandlers({ assets, filterStack, showRejected, setShowRejected, librarySelection, setLibrarySelection, declusteredAssets, setDeclusteredAssets, actions, setView, setPeopleSelectionCount, setSelectedAssetId, setShowSettings });

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
  }, [activeOverlayJobs.length]);

  if (!hasCompletedInitialSync) {return <LoadingScreen status={status} />;}

  const { backendReady, shellStyle, connectionOverlay } = getConnectionUiState(status, error);
  const totalPhotoCount = stats?.count ?? 0;

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', padding: 0, background: '#000', color: '#eee' }}>
      {error && backendReady && <ErrorBanner error={error} />}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={shellStyle}>
          <TopBar view={view} setView={handlers.handleViewChange} onOpenActions={() => setShowActions(true)} />
          <AppFilterBar view={view} filterStack={filterStack} librarySelection={librarySelection} showRejected={showRejected} onDeclusterSelection={handlers.handleDeclusterSelection} onClearSelection={() => setLibrarySelection(new Set())} onToggleRejected={handlers.handleToggleRejected} onBack={handlers.handleFilterBack} onClearAll={handlers.handleClearAllFilters} />
          <AppMainContent view={view} assets={assets} libraryActive={view === 'library'} people={people} status={status} backendReady={backendReady} filterStack={filterStack} selectedAssetId={selectedAssetId} showFaces={false} librarySelection={librarySelection} declusteredAssets={declusteredAssets} showRejected={showRejected} rejectedAssets={rejectedAssets} jobs={jobs} systemJobs={systemJobs} queueStatus={queueStatus} dataStats={dataStats} recentEvents={recentEvents} isSystemPaused={isSystemPaused} hasMoreAssets={hasMoreAssets} isLoadingMoreAssets={isLoadingMoreAssets} onLoadMoreAssets={actions.loadMoreAssets} onAssetClick={setSelectedAssetId} onUntagAsset={handlers.handleUntagAsset} onSetSensitivity={actions.setSensitivity} onLibrarySelectionChange={setLibrarySelection} onPeopleFilter={handlers.handlePeopleFilter} onPeopleSelectionChange={setPeopleSelectionCount} onRenamePerson={actions.renamePerson} onMergePeople={actions.mergePeople} onRefreshSystemJobs={actions.refreshSystemJobs} onTogglePause={actions.toggleSystemPause} onStopJob={actions.stopJob} onGetEventPayloadRaw={actions.getEventPayloadRaw} onGetJobErrors={actions.getJobErrors} onSetModulePaused={actions.setModulePaused} onGetAlbums={actions.getAlbums} onCreateAlbum={actions.createAlbum} onDeleteAlbum={actions.deleteAlbum} onOpenAlbum={handlers.handleOpenAlbum} />
          <AppStatusBar
            statusMessage={statusMessage}
            status={status}
            view={view}
            librarySelectionCount={librarySelection.size}
            shownAssetsCount={handlers.shownAssetsCount}
            peopleSelectionCount={peopleSelectionCount}
            totalPhotoCount={totalPhotoCount}
            peopleCount={people.length}
            rightSlot={
              <AppStatusRightSlot
                isTaskDrawerMinimized={isTaskDrawerMinimized}
                activeOverlayJobCount={activeOverlayJobs.length}
                onRestoreTaskDrawer={() => setIsTaskDrawerMinimized(false)}
              />
            }
          />
          <AppOverlays assets={assets} selectedAssetId={selectedAssetId} setSelectedAssetId={setSelectedAssetId} showActions={showActions} setShowActions={setShowActions} showSettings={showSettings} setShowSettings={setShowSettings} showInfoPanel={showInfoPanel} setShowInfoPanel={setShowInfoPanel} activeInfoTab={activeInfoTab} setActiveInfoTab={setActiveInfoTab} jobs={activeOverlayJobs} folderHistory={folderHistory} onScan={handlers.handleScan} onPreviews={actions.generatePreviews} onDetect={actions.detectFaces} onRecognise={actions.recogniseFaces} onCluster={actions.clusterFaces} onScanSensitive={actions.scanSensitive} onScanSensitiveAll={actions.scanSensitiveAll} onExtractAiMetadata={actions.extractAiMetadata} onRefresh={handlers.handleOverlayRefresh} onResetFaces={actions.resetFaces} onResetAll={actions.resetLibrary} onFactoryReset={actions.factoryResetLibrary} onStopScan={actions.stopScan} onBuildGroups={actions.buildGroups} onBuildBursts={actions.buildBursts} onGetSetting={actions.getSetting} onSetSetting={actions.setSetting} theme={theme} setTheme={setTheme} animationsEnabled={animationsEnabled} setAnimationsEnabled={setAnimationsEnabled} onPrioritize={actions.prioritizeAsset} onFaceClick={handlers.handleFaceClick} onIsolateFace={actions.isolateFace} onSetSensitivity={actions.setSensitivity} onOpenSettingsFromPhoto={handlers.handleOpenSettingsFromPhoto} onGetGroupOrbit={actions.getGroupOrbit} onSetCanonical={actions.setCanonical} onExplodeGroup={actions.explodeGroup} onStopJob={handleOverlayStopJob} isTaskDrawerMinimized={isTaskDrawerMinimized} onTaskDrawerMinimizedChange={setIsTaskDrawerMinimized} />
        </div>
        <ConnectionOverlayLayer connectionOverlay={connectionOverlay} status={status} />
      </div>
      <AppNotifications notifications={notifications} dismissNotification={dismissNotification} />
    </div>
  );
}
