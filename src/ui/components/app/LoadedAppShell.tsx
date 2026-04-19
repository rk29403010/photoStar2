import { useCallback } from 'react';
import type { BackgroundJob } from '@contracts/jobs';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import { buildCurrentPhotoStatus } from '@shared/utils/libraryGallery';
import { clearLibrarySelection, getLibrarySelectionCount } from '@shared/utils/librarySelectionState';
import type { usePhotoLibrary } from '@ui/hooks/usePhotoLibrary';
import type { useAppUiState } from '@ui/hooks/useAppRuntimeUi';
import type { WorkflowRunDetailResponse } from '@boundary/runtime/workflowRunDetail';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import { AppFilterBar } from './AppFilterBar';
import { AppMainContent } from './AppMainContent';
import { AppNotifications } from './AppNotifications';
import { AppOverlays } from './AppOverlays';
import { AppStatusBar } from './AppStatusBar';
import { AppStatusRightSlot, ConnectionOverlayLayer, ErrorBanner } from './AppShellDecorations';
import { TopBar } from '../TopBar';
import type { AppActionHandlers, ConnectionUiState } from './appShellModel';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';

interface LoadedAppShellProps {
    photoLibrary: ReturnType<typeof usePhotoLibrary>;
    handlers: AppActionHandlers;
    aiMode: ReturnType<typeof useAppUiState>['aiMode'];
    setAiMode: ReturnType<typeof useAppUiState>['setAiMode'];
    handleExtractAiMetadata: (assetId?: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    getWorkflowRunDetail: (runId: string) => Promise<WorkflowRunDetailResponse>;
    totalPhotoCount: number;
    activeOverlayJobs: BackgroundJob[];
    handleOverlayStopJob: (job: BackgroundJob) => void;
    connectionUiState: ConnectionUiState;
    groupDiagnosticsReport: GroupDiagnosticsReport | null;
    isLoadingGroupDiagnostics: boolean;
    onOpenGroupDiagnostics: () => void;
    onRefreshGroupDiagnostics: () => void;
    handleFlagPhotoDateCorrection: (input: PhotoDateCorrectionInput) => Promise<void>;
    uiState: ReturnType<typeof useAppUiState>;
}

export function LoadedAppShell(props: LoadedAppShellProps) {
    const {
        error,
        status,
        stats,
        assets,
        galleryTimelineSeek,
        isSeekingTimeline,
        people,
        rejectedAssets,
        workflowStatus,
        dataStats,
        recentEvents,
        workflowRuns,
        folderHistory,
        uiFeedEntries,
        ingestStatusMessage,
        actions,
        filterStack,
        notifications,
        dismissNotification,
        hasMoreAssets,
        isLoadingMoreAssets,
        isRefreshingLibrary,
    } = props.photoLibrary;
    const { backendReady, shellStyle, connectionOverlay } = props.connectionUiState;
    const ensureAssetDetails = useCallback((assetId: string) => {
        void actions.loadAssetDetails(assetId);
    }, [actions]);
    const handleAssignAssetTag = useCallback((assetId: string, tagLabel: string) => {
        return actions.assignAssetTag({ assetId, tagLabel });
    }, [actions]);
    const handleRemoveAssetTag = useCallback((assetId: string, tagDefinitionId: string) => {
        return actions.removeAssetTag({ assetId, tagDefinitionId });
    }, [actions]);

    return (
        <div className="container" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', padding: 0, background: '#000', color: '#eee' }}>
            {error && backendReady && <ErrorBanner error={error} />}
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={shellStyle}>
                    <TopBar
                        view={props.uiState.view}
                        setView={props.handlers.handleViewChange}
                        onOpenActions={() => props.uiState.setShowActions(true)}
                        onOpenSettings={() => props.uiState.setShowSettings(true)}
                        showSettings={props.uiState.showSettings}
                    />
                    <AppFilterBar view={props.uiState.view} filterStack={filterStack} librarySelection={props.uiState.librarySelection} showRejected={props.uiState.showRejected} onDeclusterSelection={props.handlers.handleDeclusterSelection} onBulkTagSelection={props.handlers.handleBulkTagSelection} onBulkUntagSelection={props.handlers.handleBulkUntagSelection} onMoveSelectionToBin={props.handlers.handleMoveSelectionToBin} onRestoreSelectionFromBin={props.handlers.handleRestoreSelectionFromBin} onClearSelection={() => props.uiState.setLibrarySelection(clearLibrarySelection())} onToggleRejected={props.handlers.handleToggleRejected} onBack={props.handlers.handleFilterBack} onClearAll={props.handlers.handleClearAllFilters} />
                    <AppMainContent view={props.uiState.view} stats={stats} assets={assets} galleryTimelineSeek={galleryTimelineSeek} isSeekingTimeline={isSeekingTimeline} libraryActive={props.uiState.view === 'library'} people={people} status={status} backendReady={backendReady} filterStack={filterStack} selectedAssetId={props.uiState.selectedAssetId} showInfoPanel={props.uiState.showInfoPanel} setShowInfoPanel={props.uiState.setShowInfoPanel} activeInfoTab={props.uiState.activeInfoTab} setActiveInfoTab={props.uiState.setActiveInfoTab} showFaces={false} librarySelection={props.uiState.librarySelection} groupSimilarPhotos={props.uiState.groupSimilarPhotos} showGroupIds={props.uiState.showGroupIds} groupDiagnosticsReport={props.groupDiagnosticsReport} isLoadingGroupDiagnostics={props.isLoadingGroupDiagnostics} declusteredAssets={props.uiState.declusteredAssets} showRejected={props.uiState.showRejected} rejectedAssets={rejectedAssets} workflowStatus={workflowStatus} dataStats={dataStats} recentEvents={recentEvents} workflowRuns={workflowRuns} uiFeedEntries={uiFeedEntries} ingestStatusMessage={ingestStatusMessage} hasMoreAssets={hasMoreAssets} isLoadingMoreAssets={isLoadingMoreAssets} isRefreshingLibrary={isRefreshingLibrary} onLoadMoreAssets={actions.loadMoreAssets} onGalleryOrderChange={actions.setGalleryOrder} onGalleryTimelineSeek={actions.seekGalleryTimeline} onAssetClick={props.uiState.setSelectedAssetId} onEnsureAssetDetails={ensureAssetDetails} onTagFilterChange={props.handlers.handleTagFilterChange} onUntagAsset={props.handlers.handleUntagAsset} onLibrarySelectionChange={props.uiState.setLibrarySelection} onGroupSimilarPhotosChange={props.uiState.setGroupSimilarPhotos} onShowGroupIdsChange={props.uiState.setShowGroupIds} onRefreshGroupDiagnostics={props.onRefreshGroupDiagnostics} onPeopleFilter={props.handlers.handlePeopleFilter} onPeopleSelectionChange={props.uiState.setPeopleSelectionCount} onRenamePerson={actions.renamePerson} onMergePeople={actions.mergePeople} onRefreshSystemJobs={actions.refreshSystemJobs} onGetEventPayloadRaw={actions.getEventPayloadRaw} onGetJobErrors={actions.getJobErrors} onGetWorkflowVisualiser={actions.getWorkflowVisualiser} onRerunMissingFolderAiMetadata={actions.rerunMissingFolderAiMetadata} onGetAlbums={actions.getAlbums} onCreateAlbum={actions.createAlbum} onDeleteAlbum={actions.deleteAlbum} onOpenAlbum={props.handlers.handleOpenAlbum} onHoverLibraryAssetChange={(asset) => props.uiState.setHoveredLibraryPhoto(asset ? buildCurrentPhotoStatus(asset) : null)} onListAvailableTags={actions.listAvailableTags} onListReviewItems={actions.listReviewItems} onAssignAssetTag={handleAssignAssetTag} onRemoveAssetTag={handleRemoveAssetTag} onMoveAssetToBin={props.handlers.handleMoveAssetToBin} onRestoreAssetFromBin={props.handlers.handleRestoreAssetFromBin} onSetReviewItemStatus={actions.setReviewItemStatus} onGetTagDefinitionDetail={actions.getTagDefinitionDetail} onRenameTagDefinition={actions.renameTagDefinition} onCreateTagAlias={actions.createTagAlias} onDeleteTagAlias={actions.deleteTagAlias} onMergeTagDefinitions={actions.mergeTagDefinitions} onFlagPhotoDateCorrection={props.handleFlagPhotoDateCorrection} />
                    <AppStatusBar statusBanner={props.uiState.statusBanner} activityMessage={ingestStatusMessage} status={status} view={props.uiState.view} librarySelectionCount={getLibrarySelectionCount(props.uiState.librarySelection)} shownAssetsCount={props.handlers.shownAssetsCount} peopleSelectionCount={props.uiState.peopleSelectionCount} totalPhotoCount={props.totalPhotoCount} peopleCount={people.length} currentPhoto={props.uiState.view === 'library' ? props.uiState.hoveredLibraryPhoto : null} rightSlot={<AppStatusRightSlot isTaskDrawerMinimized={props.uiState.isTaskDrawerMinimized} activeOverlayJobCount={props.activeOverlayJobs.length} onRestoreTaskDrawer={() => props.uiState.setIsTaskDrawerMinimized(false)} devRuntimeImpact={props.uiState.devRuntimeImpact} />} />
                    <AppOverlays assets={assets} selectedAssetId={props.uiState.selectedAssetId} setSelectedAssetId={props.uiState.setSelectedAssetId} showActions={props.uiState.showActions} setShowActions={props.uiState.setShowActions} showSettings={props.uiState.showSettings} setShowSettings={props.uiState.setShowSettings} showInfoPanel={props.uiState.showInfoPanel} setShowInfoPanel={props.uiState.setShowInfoPanel} activeInfoTab={props.uiState.activeInfoTab} setActiveInfoTab={props.uiState.setActiveInfoTab} jobs={props.activeOverlayJobs} folderHistory={folderHistory} onScan={props.handlers.handleScan} onPreviews={actions.generatePreviews} onDetect={actions.detectFaces} onCluster={actions.clusterFaces} onRecalculatePhotoDates={actions.recalculatePhotoDates} onScanSensitive={actions.scanSensitive} onScanSensitiveAll={actions.scanSensitiveAll} onExtractAiMetadata={props.handleExtractAiMetadata} onGetWorkflowRunDetail={props.getWorkflowRunDetail} onRerunFaceDetection={actions.rerunFaceDetectionForAsset} onRefresh={props.handlers.handleOverlayRefresh} onResetFaces={actions.resetFaces} onResetAll={actions.resetLibrary} onFactoryReset={actions.factoryResetLibrary} onResetGroupingData={actions.resetGroupingData} onStopScan={actions.stopScan} onOpenGroupDiagnostics={props.onOpenGroupDiagnostics} onGetSetting={actions.getSetting} onSetSetting={actions.setSetting} theme={props.uiState.theme} setTheme={props.uiState.setTheme} animationsEnabled={props.uiState.animationsEnabled} setAnimationsEnabled={props.uiState.setAnimationsEnabled} aiMode={props.aiMode} setAiMode={props.setAiMode} onPrioritize={actions.prioritizeAsset} onFaceClick={props.handlers.handleFaceClick} onIsolateFace={actions.isolateFace} onSetSensitivity={actions.setSensitivity} onMoveToBin={props.handlers.handleMoveAssetToBin} onRestoreFromBin={props.handlers.handleRestoreAssetFromBin} onOpenSettingsFromPhoto={props.handlers.handleOpenSettingsFromPhoto} onLoadAssetEvidence={(assetId) => actions.loadAssetDetails(assetId, { includeEvidence: true })} onGetGroupOrbit={actions.getGroupOrbit} onSetCanonical={actions.setCanonical} onExplodeGroup={actions.explodeGroup} onAssignAssetTag={handleAssignAssetTag} onRemoveAssetTag={handleRemoveAssetTag} onSetReviewItemStatus={actions.setReviewItemStatus} onFlagPhotoDateCorrection={props.handleFlagPhotoDateCorrection} onStopJob={props.handleOverlayStopJob} isTaskDrawerMinimized={props.uiState.isTaskDrawerMinimized} onTaskDrawerMinimizedChange={props.uiState.setIsTaskDrawerMinimized} />
                </div>
                <ConnectionOverlayLayer connectionOverlay={connectionOverlay} status={status} />
            </div>
            <AppNotifications notifications={notifications} dismissNotification={dismissNotification} />
        </div>
    );
}
