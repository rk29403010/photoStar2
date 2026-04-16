import { useCallback, useMemo } from 'react';
import type { Asset, GalleryTimelineSeek } from '@contracts/core';
import type { DevRuntimeImpact } from '@contracts/devRuntime';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import { writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { shouldRefreshLibraryForFilterStackChange } from '@shared/utils/libraryFilterStack';
import { removeAssetsById, restoreAssetsByReference } from '@shared/utils/photoBinLocalState';
import type { GalleryOrder, RefreshLibraryOptions } from './usePhotoLibrary.gallery';
import type { usePhotoLibraryState } from './usePhotoLibrary.state';
import type { useLibraryTransport } from '@boundary/runtime/usePhotoLibrary.commands';

type PhotoLibraryState = ReturnType<typeof usePhotoLibraryState>;
type RequestFn = ReturnType<typeof useLibraryTransport>['request'];
type SendCommandFn = (command: string, payload?: Record<string, unknown>) => Promise<void>;

function useFilterStackActions(params: {
    filterStackRef: PhotoLibraryState['filterStackRef'];
    setFilterStack: PhotoLibraryState['setFilterStack'];
    transport: PhotoLibraryState['transport'];
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
}) {
    const { filterStackRef, refreshLibrary, setFilterStack, transport } = params;

    const updateFilterStack = useCallback((newStack: LibraryFilter[]) => {
        const currentStack = filterStackRef.current;
        const shouldRefresh = shouldRefreshLibraryForFilterStackChange(currentStack, newStack);
        if (!shouldRefresh) {return;}
        setFilterStack(newStack);
        if (!transport) {return;}
        refreshLibrary();
    }, [filterStackRef, refreshLibrary, setFilterStack, transport]);

    const pushFilter = useCallback((filter: LibraryFilter) => {
        updateFilterStack([...filterStackRef.current, filter]);
    }, [filterStackRef, updateFilterStack]);

    const popFilter = useCallback(() => {
        const currentStack = filterStackRef.current;
        if (currentStack.length > 0) {
            updateFilterStack(currentStack.slice(0, -1));
        }
    }, [filterStackRef, updateFilterStack]);

    const clearFilters = useCallback(() => {
        updateFilterStack([]);
    }, [updateFilterStack]);

    const setFilters = useCallback((filters: LibraryFilter[]) => {
        updateFilterStack(filters);
    }, [updateFilterStack]);

    return { pushFilter, popFilter, clearFilters, setFilters };
}

function useGalleryPreferenceActions(params: {
    galleryOrderRef: PhotoLibraryState['galleryOrderRef'];
    gallerySeekRef: PhotoLibraryState['gallerySeekRef'];
    setIsSeekingTimeline: PhotoLibraryState['setIsSeekingTimeline'];
    setGalleryTimelineSeek: PhotoLibraryState['setGalleryTimelineSeek'];
    groupSimilarPhotosRef: PhotoLibraryState['groupSimilarPhotosRef'];
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    transport: PhotoLibraryState['transport'];
}) {
    const { galleryOrderRef, gallerySeekRef, setIsSeekingTimeline, setGalleryTimelineSeek, groupSimilarPhotosRef, refreshLibrary, transport } = params;

    const setGroupSimilarPhotos = useCallback((enabled: boolean) => {
        groupSimilarPhotosRef.current = enabled;
        if (!transport) {return;}
        refreshLibrary({ withGroupCounts: enabled });
    }, [groupSimilarPhotosRef, refreshLibrary, transport]);

    const setGalleryOrder = useCallback((order: GalleryOrder) => {
        if (galleryOrderRef.current === order) {return;}
        galleryOrderRef.current = order;
        if (!transport) {return;}
        refreshLibrary({ galleryOrder: order });
    }, [galleryOrderRef, refreshLibrary, transport]);

    const seekGalleryTimeline = useCallback((seek: GalleryTimelineSeek | null) => {
        gallerySeekRef.current = seek;
        setGalleryTimelineSeek(seek);
        if (!transport) {return;}
        setIsSeekingTimeline(true);
        refreshLibrary({ gallerySeek: seek });
    }, [gallerySeekRef, refreshLibrary, setGalleryTimelineSeek, setIsSeekingTimeline, transport]);

    return { setGalleryOrder, setGroupSimilarPhotos, seekGalleryTimeline };
}

export function useCoreActions(params: {
    transport: PhotoLibraryState['transport'];
    sendCommand: SendCommandFn;
    request: RequestFn;
    setAssets: PhotoLibraryState['setAssets'];
    setRejectedAssets: PhotoLibraryState['setRejectedAssets'];
    setFilterStack: PhotoLibraryState['setFilterStack'];
    filterStackRef: PhotoLibraryState['filterStackRef'];
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    groupSimilarPhotosRef: PhotoLibraryState['groupSimilarPhotosRef'];
    galleryOrderRef: PhotoLibraryState['galleryOrderRef'];
    gallerySeekRef: PhotoLibraryState['gallerySeekRef'];
    setIsSeekingTimeline: PhotoLibraryState['setIsSeekingTimeline'];
    setGalleryTimelineSeek: PhotoLibraryState['setGalleryTimelineSeek'];
}) {
    const {
        transport,
        sendCommand,
        request,
        setAssets,
        setRejectedAssets,
        setFilterStack,
        filterStackRef,
        refreshLibrary,
        groupSimilarPhotosRef,
        galleryOrderRef,
        gallerySeekRef,
        setIsSeekingTimeline,
        setGalleryTimelineSeek,
    } = params;

    const getRejectedAssetsForPerson = useCallback((personId: string | null) => {
        if (!personId) {
            setRejectedAssets([]);
            return;
        }

        void writeCommand(transport, `rejected-assets-${Date.now()}`, 'get_rejected_assets_for_person', { personId });
    }, [setRejectedAssets, transport]);

    const filterStackActions = useFilterStackActions({
        filterStackRef,
        setFilterStack,
        transport,
        refreshLibrary,
    });
    const galleryPreferenceActions = useGalleryPreferenceActions({
        galleryOrderRef,
        gallerySeekRef,
        setIsSeekingTimeline,
        setGalleryTimelineSeek,
        groupSimilarPhotosRef,
        refreshLibrary,
        transport,
    });

    return useMemo(() => ({
        prioritizeAsset: (_mediaId: string) => undefined,
        renamePerson: (personId: string, newName: string) => sendCommand('rename_person', { personId, newName }),
        mergePeople: (personIds: string[], targetName: string) => sendCommand('merge_people', { personIds, targetName }),
        isolateFace: (assetId: string, faceIndex: number) => sendCommand('isolate_face', { assetId, faceIndex }),
        isolatePersonAsset: (assetId: string, personId: string) => sendCommand('isolate_person_asset', { assetId, personId }),
        getRejectedAssetsForPerson,
        updateAsset: (id: string, partial: Partial<Asset>) => setAssets((prev) => prev.map((asset) => asset.id === id ? { ...asset, ...partial } : asset)),
        removeAssetsFromState: (assetIds: string[]) => setAssets((previousAssets) => removeAssetsById(previousAssets, assetIds)),
        restoreAssetsInState: (restoredAssets: Asset[], referenceAssets: Asset[]) => setAssets((previousAssets) => (
            restoreAssetsByReference(previousAssets, restoredAssets, referenceAssets)
        )),
        getWorkflowVisualiser: (workflowId: string, runId?: string | null): Promise<WorkflowVisualiserModel> => request<WorkflowVisualiserModel>({
            idPrefix: `get_workflow_visualiser_${workflowId}_${runId === undefined ? 'default' : runId === null ? 'definition' : runId}`,
            command: 'get_workflow_visualiser',
            payload: runId === undefined ? { workflowId } : { workflowId, runId },
            timeoutMs: 10000,
            select: (data) => data as unknown as WorkflowVisualiserModel,
        }),
        getDevRuntimeImpact: (): Promise<DevRuntimeImpact> => request<DevRuntimeImpact>({
            idPrefix: 'get_dev_runtime_impact',
            command: 'get_dev_runtime_impact',
            timeoutMs: 10000,
            select: (data) => data as unknown as DevRuntimeImpact,
        }),
        ...filterStackActions,
        ...galleryPreferenceActions,
    }), [filterStackActions, galleryPreferenceActions, getRejectedAssetsForPerson, request, sendCommand, setAssets]);
}
