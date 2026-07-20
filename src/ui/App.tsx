import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import './App.css';
import { LoadingScreen } from './components/LoadingScreen';
import { usePhotoLibrary } from './hooks/usePhotoLibrary';
import { useSelectedAssetDetails } from './hooks/useSelectedAssetDetails';
import { useSelectionRecovery } from './hooks/useSelectionRecovery';
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
import { usePhotoBinActions } from './hooks/usePhotoBinActions';
import { promptBulkTagSelection, promptBulkUntagSelection } from './hooks/libraryTagSelectionPrompts';
import {
    LoadedAppShell,
} from './components/app/LoadedAppShell';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import {
    getActiveOverlayJobs,
    getConnectionUiState,
    type AppActionHandlers,
} from './components/app/appShellModel';

type UseAppActionHandlersParams = {
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

type UseLibraryFilterHandlersParams = {
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
}

type UseLibraryFilterStateResetParams = {
    actions: ReturnType<typeof usePhotoLibrary>['actions'];
    declusteredAssets: Set<string>;
    filterStack: LibraryFilter[];
    librarySelection: LibrarySelectionState;
    setDeclusteredAssets: Dispatch<SetStateAction<Set<string>>>;
    setLibrarySelection: (selection: LibrarySelectionState) => void;
    setPeopleSelectionCount: (count: number) => void;
    setSelectedAssetId: (assetId: string | null) => void;
    setShowRejected: (showRejected: boolean | ((prev: boolean) => boolean)) => void;
    setView: (view: AppView) => void;
    showRejected: boolean;
}

function isTagFilter(filter: LibraryFilter | undefined) {
    return filter?.type === 'tag';
}

async function requestScanPath(): Promise<string | null> {
    if (canUseNativeDirectoryPicker()) {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({ directory: true, multiple: false });
            return selected && typeof selected === 'string' ? selected : null;
        } catch (error) {
            console.warn('Native directory picker unavailable; falling back to manual path prompt.', error);
        }
    }

    return globalThis.prompt('Enter absolute path to scan (e.g. C:/Users/robin/Photos):');
}

function useAppActionHandlers(params: UseAppActionHandlersParams) {
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
        setSelectedAssetId,
        setShowRejected,
        setView,
        showRejected,
    });

    const handleScan = useCallback(async (options: { path?: string; includeSubfolders: boolean }) => {
        const path = options.path ?? await requestScanPath();
        if (!path) {return;}
        const traversalMode = options.includeSubfolders ? 'recursive' : 'folder_only';
        try {
            const estimation = await actions.estimateFolderIngest(path, aiMode, traversalMode);
            const formattedCost = estimation.cost.toFixed(4);
            const userConfirmed = globalThis.confirm(
                `Folder contains ${estimation.fileCount} images. Expected cost for AI operations: $${formattedCost}.\n\nDo you want to continue?`
            );
            if (userConfirmed) {
                void actions.scanLibrary(path, aiMode, traversalMode);
            }
        } catch (error) {
            console.error('Failed to estimate folder cost:', error);
            if (globalThis.confirm('Failed to calculate folder cost estimate. Do you want to proceed with scan anyway?')) {
                void actions.scanLibrary(path, aiMode, traversalMode);
            }
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
        librarySelection,
        setView,
    } = params;
    const stateResetHandlers = useLibraryFilterStateResetHandlers(params);
    const { resetLibraryUi } = stateResetHandlers;

    const handleFilterBack = useCallback(() => {
        if (filterStack.length <= 1) {
            setView(isTagFilter(filterStack[0]) ? 'library' : 'people');
            actions.clearFilters();
        } else {
            actions.popFilter();
        }
        resetLibraryUi();
    }, [actions, filterStack, resetLibraryUi, setView]);

    const handleClearAllFilters = useCallback(() => {
        actions.clearFilters();
        setView(filterStack.some(isTagFilter) ? 'library' : 'people');
        resetLibraryUi();
    }, [actions, filterStack, resetLibraryUi, setView]);

    const handleTagFilterChange = useCallback((tag: string) => {
        actions.clearFilters();
        resetLibraryUi();
        if (!tag) {
            setView('library');
            return;
        }

        actions.pushFilter({ type: 'tag', personIds: [], value: tag, description: `Tag: ${tag}` });
        setView('library');
    }, [actions, resetLibraryUi, setView]);

    const handleBulkTagSelection = useCallback(async () => {
        await promptBulkTagSelection(actions, getLibrarySelectionPhotoIds(librarySelection));
    }, [actions, librarySelection]);

    const handleBulkUntagSelection = useCallback(async () => {
        await promptBulkUntagSelection(actions, getLibrarySelectionPhotoIds(librarySelection));
    }, [actions, librarySelection]);

    return {
        ...stateResetHandlers,
        handleFilterBack,
        handleClearAllFilters,
        handleTagFilterChange,
        handleBulkTagSelection,
        handleBulkUntagSelection,
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
        setSelectedAssetId,
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
        setSelectedAssetId(null);
        actions.pushFilter(filter);
        setView('library');
        setPeopleSelectionCount(0);
    }, [actions, setPeopleSelectionCount, setSelectedAssetId, setView]);

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
    return useCallback((assetId?: string, options?: AiMetadataRequestOptions) => {
        return actions.extractAiMetadata(assetId, options, aiMode);
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

    const prevActiveCountRef = useRef(0);
    useEffect(() => {
        const currentCount = activeOverlayJobs.length;
        const prevCount = prevActiveCountRef.current;
        prevActiveCountRef.current = currentCount;

        if (prevCount === 0 && currentCount > 0) {
            setIsTaskDrawerMinimized(false);
        } else if (prevCount > 0 && currentCount === 0) {
            setIsTaskDrawerMinimized(true);
        }
    }, [activeOverlayJobs.length, setIsTaskDrawerMinimized]);

    return { activeOverlayJobs, handleOverlayStopJob };
}

function useAppShellState(photoLibrary: ReturnType<typeof usePhotoLibrary>) {
    const { actions, assets, filterStack, jobs } = photoLibrary;
    const uiState = useAppUiState(actions.getDevRuntimeImpact);
    const { aiMode } = uiState;
    const binActions = usePhotoBinActions({
        actions,
        assets,
        librarySelection: uiState.librarySelection,
        setLibrarySelection: uiState.setLibrarySelection,
        selectedAssetId: uiState.selectedAssetId,
        setSelectedAssetId: uiState.setSelectedAssetId,
        showTransientBanner: uiState.showTransientBanner,
    });
    const baseHandlers = useAppActionHandlers({
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
    const handlers: AppActionHandlers = {
        ...baseHandlers,
        ...binActions,
    };
    const overlayJobState = useOverlayJobState(actions, jobs, uiState.setIsTaskDrawerMinimized);
    const handleExtractAiMetadata = useExtractAiMetadataHandler(actions, aiMode);

    return { handlers, handleExtractAiMetadata, overlayJobState, uiState };
}

export default function App() {
    const photoLibrary = usePhotoLibrary();
    const { status, error, hasCompletedInitialSync, stats, assets, actions } = photoLibrary;
    const { handlers, handleExtractAiMetadata, overlayJobState, uiState } = useAppShellState(photoLibrary);
    const handleFlagPhotoDateCorrection = usePhotoDateReviewHandler(actions);
    const handleRecordPhotoMetadataAssertion = useCallback(async (assetId: string, fieldPath: string, value: unknown, note?: string | null) => {
        await actions.recordPhotoMetadataAssertion({
            assetId,
            fieldPath,
            value,
            userId: 'manual_user',
            note: note ?? 'Manual edit',
            includeEvidence: true,
        });
        await actions.loadAssetDetails(assetId, { includeEvidence: true });
    }, [actions]);
    const { groupDiagnosticsReport, isLoadingGroupDiagnostics, loadGroupDiagnosticsReport } = useGroupDiagnosticsView({
        getGroupDiagnosticsReport: actions.getGroupDiagnosticsReport,
        view: uiState.view,
    });

    useSelectionRecovery({
        assets,
        selectedAssetId: uiState.selectedAssetId,
        isRefreshingLibrary: photoLibrary.isRefreshingLibrary,
        setSelectedAssetId: uiState.setSelectedAssetId,
        showTransientBanner: uiState.showTransientBanner,
    });
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
                onScanSensitiveAll={() => {
                    void actions.scanSensitiveAll();
                }}
                onStartSimulationWorkflow={(params) => {
                    void actions.startSimulationWorkflow(params);
                }}
                handleExtractAiMetadata={handleExtractAiMetadata}
                getWorkflowRunDetail={photoLibrary.actions.getWorkflowRunDetail}
                totalPhotoCount={stats?.count ?? 0}
            activeOverlayJobs={activeOverlayJobs}
            handleOverlayStopJob={handleOverlayStopJob}
            onRunWorkflowOnAssets={(workflowId, assetIds) => {
                void actions.runWorkflowOnAssets(workflowId, assetIds);
            }}
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
                onRecordPhotoMetadataAssertion={handleRecordPhotoMetadataAssertion}
                uiState={uiState}
            />
        );
}
