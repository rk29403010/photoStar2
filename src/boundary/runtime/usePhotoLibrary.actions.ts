import type { Dispatch, SetStateAction } from 'react';
import type { Asset, Album } from '@contracts/core';
import type { PipelineStage } from '@contracts/jobs';
import type { BackendTransport, RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { writeCommand } from '@boundary/transport/usePhotoLibrary.transport';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';

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
}

interface BuildActionParams {
    transport: BackendTransport | null;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
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
        prioritizeAsset: (mediaId: string) => sendCommand('prioritize_asset_processing', { mediaId }),
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
    const { request } = params;

    return {
        getGroupOrbit: (groupId: string): Promise<Asset[]> => request({
            idPrefix: `get_orbit_${groupId}`,
            command: 'get_group_orbit',
            payload: { groupId },
            select: (data) => (data?.orbit as Asset[]) || [],
        }),
        setCanonical: (groupId: string, assetId: string): Promise<void> => request<void>({
            idPrefix: 'set_canonical',
            command: 'set_canonical',
            payload: { groupId, assetId },
            select: () => undefined,
        }),
        explodeGroup: (groupId: string): Promise<void> => request<void>({
            idPrefix: 'explode_group',
            command: 'explode_group',
            payload: { groupId },
            select: () => undefined,
        }),
    };
}

export function createBuildActions(params: BuildActionParams) {
    const { transport, addJob } = params;

    return {
        buildGroups: async () => {
            const jobId = 'build-groups-' + Date.now();
            addJob(jobId, 'similarity_cluster', 'Analyze Relationships (Duplicates & Variants)');
            await writeCommand(transport, jobId, 'build_groups', {});
        },
        buildBursts: async () => {
            const jobId = 'build-bursts-' + Date.now();
            addJob(jobId, 'similarity_cluster', 'Analyze Relationships (Bursts & Sequences)');
            await writeCommand(transport, jobId, 'build_bursts', {});
        },
    };
}
