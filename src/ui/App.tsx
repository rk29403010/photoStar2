import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import './App.css';
import { LoadingScreen } from './components/LoadingScreen';
import { usePhotoLibrary } from './hooks/usePhotoLibrary';
import { canUseNativeDirectoryPicker } from '@boundary/runtime/backend';
import type { LibraryFilter } from './hooks/usePhotoLibrary';
import type { BackgroundJob } from '@contracts/jobs';
import {
    clearLibrarySelection,
    getLibrarySelectionPhotoIds,
    type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';
import { useAppUiState, type AppView } from './hooks/useAppRuntimeUi';
import { useGroupDiagnosticsView } from './hooks/useGroupDiagnosticsView';
import { usePhotoDateReviewHandler } from './hooks/usePhotoDateReviewHandler';
import {
    LoadedAppShell,
} from './components/app/LoadedAppShell';
import {
    getActiveOverlayJobs,
    getConnectionUiState,
    type AppActionHandlers,
} from './components/app/appShellModel';

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
    aiMode: ReturnType<typeof useAppUiState>['aiMode'];
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
    setStatusMessage: Dispatch<SetStateAction<string | null>>,
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
        actions,
        aiMode,
        assets,
        declusteredAssets,
        filterStack,
        librarySelection,
        setDeclusteredAssets,
        setLibrarySelection,
        setPeopleSelectionCount,
        setSelectedAssetId,
        setShowRejected,
        setShowSettings,
        setView,
        showRejected,
    } = params;
    const shownAssetsCount = useMemo(() => {
        return filterStack.length > 0
            ? assets.filter((asset) => Boolean(asset.preview_path)).length
            : -1;
    }, [assets, filterStack]);
    const filterHandlers = useLibraryFilterHandlers({
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

    const handleScan = useCallback(async (specificPath?: string) => {
        const path = specificPath ?? await requestScanPath();
        if (path) {
            void actions.scanLibrary(path, aiMode);
        }
    }, [actions, aiMode]);

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
        actions,
        filterStack,
        setView,
    } = params;
    const stateResetHandlers = useLibraryFilterStateResetHandlers(params);
    const { resetLibraryUi } = stateResetHandlers;

    const handleFilterBack = useCallback(() => {
        const currentFilter = filterStack[filterStack.length - 1];
        if (filterStack.length <= 1) {
            actions.clearFilters();
            if (currentFilter?.type !== 'tag') {
                setView('people');
            }
        } else {
            actions.popFilter();
        }
        resetLibraryUi();
    }, [actions, filterStack, resetLibraryUi, setView]);

    const handleClearAllFilters = useCallback(() => {
        actions.clearFilters();
        if (filterStack.some((filter) => filter.type !== 'tag')) {
            setView('people');
        }
        resetLibraryUi();
    }, [actions, filterStack, resetLibraryUi, setView]);

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
        filterStack,
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

    const handleTagFilter = useCallback((tag: string) => {
        const trimmedTag = tag.trim();
        const filtersWithoutTag = filterStack.filter((filter) => filter.type !== 'tag');

        if (!trimmedTag) {
            actions.setFilters(filtersWithoutTag);
            resetLibraryUi();
            return;
        }

        actions.setFilters([
            ...filtersWithoutTag,
            { type: 'tag', tag: trimmedTag, description: trimmedTag, personIds: [] },
        ]);
        setView('library');
        resetLibraryUi();
    }, [actions, filterStack, resetLibraryUi, setView]);

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
        handleTagFilter,
        handleOpenAlbum,
    };
}

function useAppAppearance(theme: string, animationsEnabled: boolean) {
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('no-animations', !animationsEnabled);
    }, [theme, animationsEnabled]);
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

function useExtractAiMetadataHandler(
    actions: ReturnType<typeof usePhotoLibrary>['actions'],
    aiMode: ReturnType<typeof useAppUiState>['aiMode'],
) {
    return useCallback((assetId?: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => {
        return actions.extractAiMetadata(assetId, imageStrategy, aiMode);
    }, [actions, aiMode]);
}

function useOverlayJobState(
    actions: ReturnType<typeof usePhotoLibrary>['actions'],
    jobs: BackgroundJob[],
    setIsTaskDrawerMinimized: Dispatch<SetStateAction<boolean>>,
) {
    const activeOverlayJobs = useMemo(() => getActiveOverlayJobs(jobs), [jobs]);
    const handleOverlayStopJob = useCallback((job: BackgroundJob) => {
        if (job.state === 'queued') {
            void actions.removeQueuedJob(job.id);
            return;
        }

        void actions.stopJob(job.id);
    }, [actions]);

    useEffect(() => {
        if (activeOverlayJobs.length === 0) {
            setIsTaskDrawerMinimized(false);
        }
    }, [activeOverlayJobs.length, setIsTaskDrawerMinimized]);

    return { activeOverlayJobs, handleOverlayStopJob };
}

function useSelectedAssetDetails(
    loadAssetDetails: ReturnType<typeof usePhotoLibrary>['actions']['loadAssetDetails'],
    selectedAssetId: string | null,
) {
    useEffect(() => {
        if (!selectedAssetId) {return;}
        void loadAssetDetails(selectedAssetId);
    }, [loadAssetDetails, selectedAssetId]);
}

function useAppShellState(photoLibrary: ReturnType<typeof usePhotoLibrary>) {
    const { actions, assets, filterStack, jobs } = photoLibrary;
    const uiState = useAppUiState(actions.getDevRuntimeImpact);
    const { aiMode } = uiState;
    const handlers = useAppActionHandlers({
        assets,
        filterStack,
        showRejected: uiState.showRejected,
        setShowRejected: uiState.setShowRejected,
        librarySelection: uiState.librarySelection,
        setLibrarySelection: uiState.setLibrarySelection,
        declusteredAssets: uiState.declusteredAssets,
        setDeclusteredAssets: uiState.setDeclusteredAssets,
        actions,
        aiMode,
        setView: uiState.setView,
        setPeopleSelectionCount: uiState.setPeopleSelectionCount,
        setSelectedAssetId: uiState.setSelectedAssetId,
        setShowSettings: uiState.setShowSettings,
    });
    const overlayJobState = useOverlayJobState(actions, jobs, uiState.setIsTaskDrawerMinimized);
    const handleExtractAiMetadata = useExtractAiMetadataHandler(actions, aiMode);

    return { handlers, handleExtractAiMetadata, overlayJobState, uiState };
}

export default function App() {
    const photoLibrary = usePhotoLibrary();
    const { status, error, hasCompletedInitialSync, stats, assets, actions } = photoLibrary;
    const { handlers, handleExtractAiMetadata, overlayJobState, uiState } = useAppShellState(photoLibrary);
    const handleFlagPhotoDateCorrection = usePhotoDateReviewHandler(actions);
    const { groupDiagnosticsReport, isLoadingGroupDiagnostics, loadGroupDiagnosticsReport } = useGroupDiagnosticsView({
        getGroupDiagnosticsReport: actions.getGroupDiagnosticsReport,
        view: uiState.view,
    });

    useSelectionRecovery(assets, uiState.selectedAssetId, uiState.setSelectedAssetId, uiState.setStatusMessage);
    const loadAssetDetails = actions.loadAssetDetails;
    const setGroupSimilarPhotos = actions.setGroupSimilarPhotos;
    const { activeOverlayJobs, handleOverlayStopJob } = overlayJobState;
    useEffect(() => {
        setGroupSimilarPhotos(uiState.groupSimilarPhotos);
    }, [setGroupSimilarPhotos, uiState.groupSimilarPhotos]);

    useSelectedAssetDetails(loadAssetDetails, uiState.selectedAssetId);
    useAppAppearance(uiState.theme, uiState.animationsEnabled);
    useStartupConsoleTimeline(status, error, hasCompletedInitialSync);

    if (!hasCompletedInitialSync) {return <LoadingScreen status={status} />;}

    return (
            <LoadedAppShell
                photoLibrary={photoLibrary}
                handlers={handlers}
                aiMode={uiState.aiMode}
                setAiMode={uiState.setAiMode}
                handleExtractAiMetadata={handleExtractAiMetadata}
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
                handleFlagPhotoDateCorrection={handleFlagPhotoDateCorrection}
                uiState={uiState}
            />
        );
}
