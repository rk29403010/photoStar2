import type { Dispatch, SetStateAction } from 'react';
import type { Asset, Album, SimilarityOrbit } from '@contracts/core';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import type { JobState, PipelineStage } from '@contracts/jobs';
import type { BackendTransport, RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { replaceGroupRepresentative } from '@ui/components/single-photo/singlePhotoAssetModel';

type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<void>;

type SetAssets = Dispatch<SetStateAction<Asset[]>>;
type SetRejectedAssets = Dispatch<SetStateAction<Asset[]>>;

interface CoreActionParams {
    sendCommand: SendCommand;
    setAssets: SetAssets;
    setRejectedAssets: SetRejectedAssets;
    getFilterStack: () => LibraryFilter[];
    updateFilterStack: (newStack: LibraryFilter[]) => void;
    transport: BackendTransport | null;
}

interface AlbumActionParams {
    request: RequestFn;
}

interface GroupActionParams {
    request: RequestFn;
    refreshLibrary: (options?: { galleryOrder?: 'default' | 'previewed_first'; preservePagingState?: boolean }) => void;
    setAssets: SetAssets;
}

interface BuildActionParams {
    transport: BackendTransport | null;
    request: RequestFn;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: JobState) => void;
    refreshLibrary: (options?: { galleryOrder?: 'default' | 'previewed_first'; preservePagingState?: boolean }) => void;
    refreshSystemJobs: () => void;
    loadAssetDetails: (assetId: string, options?: { includeEvidence?: boolean }) => Promise<void>;
}

type WorkflowRunDetailResponse = {
    summary?: {
        status?: string;
    };
};

async function getWorkflowRunDetail(request: RequestFn, runId: string): Promise<WorkflowRunDetailResponse> {
    return request<WorkflowRunDetailResponse>({
        idPrefix: `workflow_run_status_${runId}`,
        command: 'get_workflow_run_detail',
        payload: { runId },
        timeoutMs: 10000,
        select: (data) => data as WorkflowRunDetailResponse,
    });
}

function scheduleWorkflowRunRefresh(params: Pick<BuildActionParams, 'request' | 'updateJobState' | 'refreshLibrary' | 'refreshSystemJobs'> & {
    localJobId: string;
    runId: string;
    onCompleted?: () => void;
}) {
    const poll = async () => {
        params.refreshLibrary({ preservePagingState: true });
        params.refreshSystemJobs();

        try {
            const detail = await getWorkflowRunDetail(params.request, params.runId);
            const status = String(detail.summary?.status || '');

            if (status === 'completed') {
                params.updateJobState(params.localJobId, 'completed');
                params.refreshLibrary();
                params.refreshSystemJobs();
                params.onCompleted?.();
                return;
            }

            if (status === 'failed') {
                params.updateJobState(params.localJobId, 'failed');
                params.refreshSystemJobs();
                return;
            }
        } catch {
            params.updateJobState(params.localJobId, 'failed');
            params.refreshSystemJobs();
            return;
        }

        window.setTimeout(() => {
            void poll();
        }, 1500);
    };

    window.setTimeout(() => {
        void poll();
    }, 1500);
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
                onCompleted: assetId ? () => {
                    void params.loadAssetDetails(assetId, { includeEvidence: true });
                } : undefined,
            });

            return runId;
        },
    };
}
