import type { Dispatch, SetStateAction } from 'react';
import type { Asset, Album, ReviewItemSummary, SimilarityOrbit, TagDefinitionSummary } from '@contracts/core';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import type { JobState, PipelineStage } from '@contracts/jobs';
import type { BackendTransport, RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';
import { createTagVocabularyActions } from '@boundary/runtime/tagVocabularyActions';
import { scheduleWorkflowRunRefresh } from '@boundary/runtime/workflowOverlayJobs';
import { replaceGroupRepresentative } from '@ui/components/single-photo/singlePhotoAssetModel';
import { fetchAssetTagContext } from '@ui/hooks/assetTagContext';

type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<void>;

type SetAssets = Dispatch<SetStateAction<Asset[]>>;
type SetRejectedAssets = Dispatch<SetStateAction<Asset[]>>;

type CoreActionParams = {
    sendCommand: SendCommand;
    setAssets: SetAssets;
    setRejectedAssets: SetRejectedAssets;
    getFilterStack: () => LibraryFilter[];
    updateFilterStack: (newStack: LibraryFilter[]) => void;
    transport: BackendTransport | null;
}

type AlbumActionParams = {
    request: RequestFn;
}

type GroupActionParams = {
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    setAssets: SetAssets;
}

type BuildActionParams = {
    transport: BackendTransport | null;
    request: RequestFn;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: JobState) => void;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshSystemJobs: () => void;
    loadAssetDetails: (assetId: string, options?: { includeEvidence?: boolean }) => Promise<void>;
}

type TagActionParams = {
    request: RequestFn;
    setAssets: SetAssets;
    refreshLibrary: (options?: { galleryOrder?: 'default' | 'previewed_first'; preservePagingState?: boolean }) => void;
}

export function createCoreActions(params: CoreActionParams) {
    const { sendCommand, setAssets, setRejectedAssets, getFilterStack, updateFilterStack, transport } = params;

    const getRejectedAssetsForPerson = (personId: string | null) => {
        if (!personId) {
            setRejectedAssets([]);
            return;
        }

        void writeCommand(transport, `rejected-assets-${Date.now()}`, 'get_rejected_assets_for_person', { personId });
    };

    return {
        prioritizeAsset: (_mediaId: string) => undefined,
        renamePerson: (personId: string, newName: string) => sendCommand('rename_person', { personId, newName }),
        mergePeople: (personIds: string[], targetName: string) => sendCommand('merge_people', { personIds, targetName }),
        isolateFace: (assetId: string, faceIndex: number) => sendCommand('isolate_face', { assetId, faceIndex }),
        isolatePersonAsset: (assetId: string, personId: string) => sendCommand('isolate_person_asset', { assetId, personId }),
        getRejectedAssetsForPerson,
        updateAsset: (id: string, partial: Partial<Asset>) => setAssets((prev) => prev.map((asset) => asset.id === id ? { ...asset, ...partial } : asset)),
        pushFilter: (filter: LibraryFilter) => updateFilterStack([...getFilterStack(), filter]),
        popFilter: () => {
            const currentStack = getFilterStack();
            if (currentStack.length > 0) {updateFilterStack(currentStack.slice(0, -1));}
        },
        clearFilters: () => updateFilterStack([]),
    };
}

export function createAlbumActions(params: AlbumActionParams) {
    const { request } = params;

    return {
        createAlbum: (title: string, description?: string): Promise<{ albumId: string }> => request({
            idPrefix: 'create_album',
            command: 'create_album',
            payload: { title, description },
            select: (data) => (data || {}) as { albumId: string },
        }),
        getAlbums: (): Promise<Album[]> => request({
            idPrefix: 'get_albums',
            command: 'get_albums',
            payload: {},
            select: (data) => (data?.albums as Album[]) || [],
        }),
        getAlbumItems: (albumId: string): Promise<Asset[]> => request({
            idPrefix: `get_album_items_${albumId}`,
            command: 'get_album_items',
            payload: { albumId },
            select: (data) => (data?.items as Asset[]) || [],
        }),
        addToAlbum: (albumId: string, assetIds: string[]): Promise<void> => request<void>({
            idPrefix: 'add_to_album',
            command: 'add_to_album',
            payload: { albumId, assetIds },
            select: () => undefined,
        }),
        removeFromAlbum: (albumId: string, assetIds: string[]): Promise<void> => request<void>({
            idPrefix: 'remove_from_album',
            command: 'remove_from_album',
            payload: { albumId, assetIds },
            select: () => undefined,
        }),
        moveToBin: (assetIds: string[]): Promise<void> => request<void>({
            idPrefix: 'move_to_bin',
            command: 'move_to_bin',
            payload: { assetIds },
            select: () => undefined,
        }),
        restoreFromBin: (assetIds: string[]): Promise<void> => request<void>({
            idPrefix: 'restore_from_bin',
            command: 'restore_from_bin',
            payload: { assetIds },
            select: () => undefined,
        }),
        deleteAlbum: (albumId: string): Promise<void> => request<void>({
            idPrefix: 'delete_album',
            command: 'delete_album',
            payload: { albumId },
            select: () => undefined,
        }),
    };
}

export function createGroupActions(params: GroupActionParams) {
    const { request, refreshLibrary, setAssets } = params;

    return {
        getGroupOrbit: (groupId: string): Promise<SimilarityOrbit> => request({
            idPrefix: `get_orbit_${groupId}`,
            command: 'get_group_orbit',
            payload: { groupId },
            select: (data) => data?.orbit as SimilarityOrbit,
        }),
        getGroupDiagnosticsReport: (): Promise<GroupDiagnosticsReport> => request({
            idPrefix: 'get_group_diagnostics_report',
            command: 'get_group_diagnostics_report',
            payload: {},
            select: (data) => data?.report as GroupDiagnosticsReport,
        }),
        setCanonical: async (groupId: string, assetId: string, replacementAsset?: Asset): Promise<void> => {
            await request<void>({
                idPrefix: 'set_canonical',
                command: 'set_canonical',
                payload: { groupId, assetId },
                select: () => undefined,
            });

            if (replacementAsset) {
                setAssets((previousAssets) => replaceGroupRepresentative(previousAssets, groupId, replacementAsset));
            }

            refreshLibrary({ preservePagingState: true });
        },
        explodeGroup: (groupId: string): Promise<void> => request<void>({
            idPrefix: 'explode_group',
            command: 'explode_group',
            payload: { groupId },
            select: () => undefined,
        }),
    };
}

export function createBuildActions(params: BuildActionParams) {
    const { transport, request, addJob, updateJobState, refreshLibrary, refreshSystemJobs } = params;

    return {
        resetGroupingData: async () => {
            const jobId = 'reset-grouping-' + Date.now();
            await writeCommand(transport, jobId, 'reset_grouping_data', {});
        },
        buildGroups: async (): Promise<string> => {
            const localJobId = 'build-groups-' + Date.now();
            addJob(localJobId, 'similarity_cluster', 'Runtime Grouping (Duplicates, Variants & Bursts)');
            const runId = await request<string>({
                idPrefix: 'start_library_grouping',
                command: 'start_library_grouping',
                payload: {},
                timeoutMs: 10000,
                select: (data) => String(data?.runId || ''),
            });

            if (!runId) {
                updateJobState(localJobId, 'failed');
                return '';
            }

            updateJobState(localJobId, 'running');
            scheduleWorkflowRunRefresh({
                request,
                updateJobState,
                refreshLibrary,
                refreshSystemJobs,
                localJobId,
                runId,
                title: 'Runtime Grouping (Duplicates, Variants & Bursts)',
            });

            return runId;
        },
        recalculatePhotoDates: async (assetId?: string): Promise<string> => {
            const localJobId = 'recalculate-photo-dates-' + Date.now();
            addJob(localJobId, 'analysis', assetId ? 'Recalculating Photo Date' : 'Recalculating Photo Dates');
            updateJobState(localJobId, 'starting');

            const runId = await request<string>({
                idPrefix: 'start_library_photo_date_workflow',
                command: 'start_library_photo_date_workflow',
                payload: assetId ? { mediaId: assetId } : {},
                timeoutMs: 10000,
                select: (data) => String(data?.runId || ''),
            });

            if (!runId) {
                updateJobState(localJobId, 'failed');
                return '';
            }

            updateJobState(localJobId, 'running');
            scheduleWorkflowRunRefresh({
                request,
                updateJobState,
                refreshLibrary,
                refreshSystemJobs,
                localJobId,
                runId,
                title: assetId ? 'Recalculating Photo Date' : 'Recalculating Photo Dates',
                onCompleted: assetId ? () => {
                    void params.loadAssetDetails(assetId, { includeEvidence: true });
                } : undefined,
            });

            return runId;
        },
    };
}

function updateAssetTagState(
    setAssets: SetAssets,
    assetId: string,
    nextState: Pick<Asset, 'tags' | 'pending_review_items'>,
) {
    setAssets((previousAssets) => previousAssets.map((asset) => (
        asset.id === assetId ? { ...asset, ...nextState } : asset
    )));
}

type AssignAssetTagPayload = {
    assetId: string;
    tagDefinitionId?: string;
    tagLabel?: string;
    userId?: string | null;
};

type RemoveAssetTagPayload = {
    assetId: string;
    tagDefinitionId: string;
};

type BulkAssignAssetTagPayload = {
    assetIds: string[];
    tagDefinitionId?: string;
    tagLabel?: string;
    userId?: string | null;
};

type BulkRemoveAssetTagPayload = {
    assetIds: string[];
    tagDefinitionId: string;
};

type ListReviewItemsPayload = {
    status?: ReviewItemSummary['status'];
    reviewItemType?: ReviewItemSummary['reviewItemType'];
    subjectType?: string;
    subjectId?: string;
};

type SetReviewItemStatusPayload = {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    reviewerId?: string | null;
    reviewNote?: string | null;
    tagDefinitionId?: string;
    tagLabel?: string;
};

function refreshTagAwareAsset(
    request: RequestFn,
    setAssets: SetAssets,
    refreshLibrary: TagActionParams['refreshLibrary'],
    assetId: string,
) {
    return fetchAssetTagContext(request, assetId).then((tagContext) => {
        updateAssetTagState(setAssets, assetId, {
            tags: tagContext.tags,
            pending_review_items: tagContext.pendingReviewItems,
        });
        refreshLibrary({ preservePagingState: true });
    });
}

function requestTagCommand(
    request: RequestFn,
    command: string,
    idPrefix: string,
    payload: Record<string, unknown>,
) {
    return request<void>({
        idPrefix,
        command,
        payload,
        select: () => undefined,
    });
}

function listAvailableTagDefinitions(request: RequestFn) {
    return request<TagDefinitionSummary[]>({
        idPrefix: 'list_available_tags',
        command: 'list_available_tags',
        select: (data) => (data?.tags as TagDefinitionSummary[]) || [],
    });
}

function listTagReviewItems(request: RequestFn, payload: ListReviewItemsPayload) {
    return request<ReviewItemSummary[]>({
        idPrefix: 'list_review_items',
        command: 'list_review_items',
        payload,
        select: (data) => (data?.reviewItems as ReviewItemSummary[]) || [],
    });
}

async function assignAssetTag(
    request: RequestFn,
    setAssets: SetAssets,
    refreshLibrary: TagActionParams['refreshLibrary'],
    payload: AssignAssetTagPayload,
) {
    await requestTagCommand(request, 'assign_asset_tag', `assign_asset_tag_${payload.assetId}`, payload);
    await refreshTagAwareAsset(request, setAssets, refreshLibrary, payload.assetId);
}

async function removeAssetTag(
    request: RequestFn,
    setAssets: SetAssets,
    refreshLibrary: TagActionParams['refreshLibrary'],
    payload: RemoveAssetTagPayload,
) {
    await requestTagCommand(request, 'remove_asset_tag', `remove_asset_tag_${payload.assetId}`, payload);
    await refreshTagAwareAsset(request, setAssets, refreshLibrary, payload.assetId);
}

async function runBulkTagMutation(
    request: RequestFn,
    refreshLibrary: TagActionParams['refreshLibrary'],
    command: 'bulk_assign_asset_tag' | 'bulk_remove_asset_tag',
    payload: BulkAssignAssetTagPayload | BulkRemoveAssetTagPayload,
) {
    await requestTagCommand(request, command, command, payload as Record<string, unknown>);
    refreshLibrary({ preservePagingState: true });
}

async function setTagReviewItemStatus(
    request: RequestFn,
    setAssets: SetAssets,
    refreshLibrary: TagActionParams['refreshLibrary'],
    payload: SetReviewItemStatusPayload,
) {
    const updatedReviewItem = await request<ReviewItemSummary>({
        idPrefix: `set_review_item_status_${payload.reviewItemId}`,
        command: 'set_review_item_status',
        payload,
        select: (data) => data?.reviewItem as ReviewItemSummary,
    });
    if (updatedReviewItem.subjectType === 'asset') {
        await refreshTagAwareAsset(request, setAssets, refreshLibrary, updatedReviewItem.subjectId);
        return;
    }
    refreshLibrary({ preservePagingState: true });
}

export function createTagActions(params: TagActionParams) {
    const { request, setAssets, refreshLibrary } = params;
    const vocabularyActions = createTagVocabularyActions({ request, refreshLibrary });

    return {
        listAvailableTags: () => listAvailableTagDefinitions(request),
        assignAssetTag: (payload: AssignAssetTagPayload) => assignAssetTag(request, setAssets, refreshLibrary, payload),
        removeAssetTag: (payload: RemoveAssetTagPayload) => removeAssetTag(request, setAssets, refreshLibrary, payload),
        bulkAssignAssetTag: (payload: BulkAssignAssetTagPayload) => runBulkTagMutation(request, refreshLibrary, 'bulk_assign_asset_tag', payload),
        bulkRemoveAssetTag: (payload: BulkRemoveAssetTagPayload) => runBulkTagMutation(request, refreshLibrary, 'bulk_remove_asset_tag', payload),
        listReviewItems: (payload: ListReviewItemsPayload) => listTagReviewItems(request, payload),
        setReviewItemStatus: (payload: SetReviewItemStatusPayload) => setTagReviewItemStatus(request, setAssets, refreshLibrary, payload),
        ...vocabularyActions,
    };
}
