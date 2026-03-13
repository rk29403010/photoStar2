import type { Asset, Person } from '@contracts/core';
import type { BackgroundJob, DataStatsSnapshot, QueueStatusSnapshot, RecentEventSnapshot, WorkflowRunListItem } from '@contracts/jobs';
import type { WsResponse } from '@contracts/schemas';
import { WsResponseSchema } from '@contracts/schemas';
import type { DomainEvent } from '@contracts/events';
import { applyQuotaNotifications } from '@boundary/runtime/usePhotoLibrary.connection.notifications';
import type { FolderHistoryItem, LibraryFilter } from '@contracts/usePhotoLibrary.types';
import type { ConnectionStateParams, ParamsRef } from '@boundary/runtime/usePhotoLibrary.connection';

const INITIAL_SYNC_REQUEST_IDS = ['stats-init', 'assets-init', 'people-init', 'system-jobs-init', 'pause-state-init'] as const;
const INITIAL_SYNC_REQUEST_ID_SET = new Set<string>(INITIAL_SYNC_REQUEST_IDS);

function dedupeAssetsById(assets: Asset[]): Asset[] {
    const deduped = new Map<string, Asset>();
    for (const asset of assets) {deduped.set(asset.id, asset);}
    return Array.from(deduped.values());
}

function parseMessage(line: string): WsResponse | null {
    try {
        return WsResponseSchema.parse(JSON.parse(line));
    } catch {
        return null;
    }
}

export function currentFilter(filterStackRef: { current: LibraryFilter[] }): LibraryFilter | undefined {
    const stack = filterStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

function isAssetResponseId(id: string | undefined) {
    return typeof id === 'string' && (id === 'assets-init' || id.startsWith('get_assets-') || id.startsWith('get_assets_page_'));
}

function isAssetPageResponse(id: string | undefined) {
    return typeof id === 'string' && id.startsWith('get_assets_page_');
}

function appendAssets(existingAssets: Asset[], incomingAssets: Asset[]) {
    return dedupeAssetsById([...existingAssets, ...incomingAssets]);
}

function applySnapshotPayload(data: Record<string, unknown>, params: ConnectionStateParams) {
    if (data.people) {params.setPeople(data.people as Person[]);}
    if (data.jobs) {params.setSystemJobs(data.jobs as BackgroundJob[]);}
    if (data.queueStatus) {params.setQueueStatus(data.queueStatus as QueueStatusSnapshot);}
    if (data.dataStats) {params.setDataStats(data.dataStats as DataStatsSnapshot);}
    if (data.recentEvents) {params.setRecentEvents(data.recentEvents as RecentEventSnapshot[]);}
    if (data.workflowRuns) {params.setWorkflowRuns(data.workflowRuns as WorkflowRunListItem[]);}
    if (data.folderHistory) {params.setFolderHistory(data.folderHistory as FolderHistoryItem[]);}
}

function applyOkAssetPayload(msg: WsResponse, params: ConnectionStateParams, assets: Asset[]) {
    if (msg.id?.startsWith('rejected-assets-')) {
        params.setRejectedAssets(assets);
        return;
    }

    if (isAssetPageResponse(msg.id)) {
        params.setAssets((previousAssets) => appendAssets(previousAssets, assets));
        params.setIsLoadingMoreAssets(false);
        return;
    }

    if (msg.id === 'assets-init' && params.hasCompletedInitialSync) {
        params.setAssets((previousAssets) => appendAssets(previousAssets, assets));
        return;
    }

    params.setAssets(() => assets);
}

function handleOkMessage(msg: WsResponse, params: ConnectionStateParams) {
    const data = msg.data;
    if (!data) {return;}
    if (data.message === 'pong') {params.addLog('Pong received');}
    if (data.isPaused !== undefined) {params.setIsSystemPaused(data.isPaused);}
    if (data.count !== undefined) {params.setStats(data);}
    applySnapshotPayload(data, params);
    if (!data.assets) {return;}

    const assets = dedupeAssetsById(data.assets as Asset[]);
    applyOkAssetPayload(msg, params, assets);

    if (isAssetResponseId(msg.id) && data.hasMore !== undefined) {
        params.setHasMoreAssets(Boolean(data.hasMore));
    }
}

function handleErrorMessage(msg: WsResponse, params: ConnectionStateParams) {
    if (isAssetPageResponse(msg.id)) {
        params.setIsLoadingMoreAssets(false);
    }
    if (!msg.error) {return;}
    params.addLog(`Command ${msg.id ?? 'unknown'} failed: ${msg.error}`);
}

function applyMediaDiscoveredEvent(event: Record<string, unknown>, params: ConnectionStateParams) {
    params.setStats((prev) => ({ count: (prev?.count ?? 0) + 1, processed_faces: prev?.processed_faces }));
    const newAsset: Asset = {
        id: String(event.mediaId),
        original_path: String(event.filePath),
        width: Number(event.width),
        height: Number(event.height),
        created_at: new Date().toISOString(),
    };
    params.setAssets((prev) => (prev.some((asset) => asset.id === newAsset.id) ? prev : [...prev, newAsset]));
}

function applyMappedAssetUpdate(
    mediaId: unknown,
    params: ConnectionStateParams,
    updater: (asset: Asset) => Asset
) {
    params.setAssets((prev) => prev.map((asset) => asset.id === mediaId ? updater(asset) : asset));
}

function applyAssetUpdatedEvent(event: Record<string, unknown>, params: ConnectionStateParams) {
    const updated = event.asset as Asset;
    params.setAssets((prev) => {
        let found = false;
        const next = prev.map((asset) => {
            if (asset.id !== updated.id) {
                return asset;
            }

            found = true;
            return { ...asset, ...updated };
        });
        return dedupeAssetsById(found ? next : [...next, updated]);
    });
}

function applyEventAssetUpdates(event: Record<string, unknown>, params: ConnectionStateParams) {
    if (event.type === 'MediaDiscovered') {
        applyMediaDiscoveredEvent(event, params);
        return;
    }

    if (event.type === 'PreviewGenerated') {
        applyMappedAssetUpdate(event.mediaId, params, (asset) => ({ ...asset, preview_path: String(event.path) }));
        return;
    }

    if (event.type === 'SensitivityScored') {
        applyMappedAssetUpdate(event.mediaId, params, (asset) => ({ ...asset, sensitivity_score: Number(event.score) }));
        return;
    }

    if (event.type === 'AssetUpdated' && event.asset) {
        applyAssetUpdatedEvent(event, params);
    }
}

function applyFaceStats(event: Record<string, unknown>, params: ConnectionStateParams) {
    if (event.type !== 'FacesDetected' || Number(event.faceCount) <= 0) {return;}
    params.setStats((prev) => ({
        ...prev,
        count: prev?.count || 0,
        processed_faces: Number(prev?.processed_faces ?? 0) + Number(event.faceCount),
    }));
}

function handleEventMessage(msg: WsResponse, params: ConnectionStateParams) {
    if (msg.id !== 'event_stream') {
        params.updateJobProgress(msg.id, msg.data);
        return;
    }

    const event = msg.data as Record<string, unknown>;
    if (event.type === 'SystemPausedStateChanged') {
        params.setIsSystemPaused(Boolean(event.isPaused));
        return;
    }

    params.processEvent(event as DomainEvent);
    applyQuotaNotifications(event, params.addNotification);
    applyFaceStats(event, params);
    applyEventAssetUpdates(event, params);
}

function createPendingInitialSyncIds(): Set<string> {
    return new Set<string>(INITIAL_SYNC_REQUEST_IDS);
}

function isInitialSyncResponse(msg: WsResponse): boolean {
    return typeof msg.id === 'string' && INITIAL_SYNC_REQUEST_ID_SET.has(msg.id);
}

function getSnapshotStatus(hasCompletedInitialSync: boolean, transportLabel: string): string {
    return hasCompletedInitialSync
        ? `Refreshing library data (${transportLabel})...`
        : `Loading library data (${transportLabel})...`;
}

export function createSnapshotSyncController(paramsRef: ParamsRef) {
    let activeTransportLabel = 'WS';
    let pendingInitialSyncIds = createPendingInitialSyncIds();
    let initialSyncErrors: string[] = [];

    const finishSnapshotSync = () => {
        paramsRef.current.setHasCompletedInitialSync(true);
        paramsRef.current.setStatus(`Ready (${activeTransportLabel})`);
        paramsRef.current.setError(initialSyncErrors.length > 0 ? initialSyncErrors[0] : null);
        if (initialSyncErrors.length > 0) {
            paramsRef.current.addLog(`Snapshot sync completed with ${initialSyncErrors.length} error(s).`);
            return;
        }
        paramsRef.current.addLog('Snapshot sync completed.');
    };

    return {
        beginSnapshotSync(transportLabel: string) {
            activeTransportLabel = transportLabel;
            pendingInitialSyncIds = createPendingInitialSyncIds();
            initialSyncErrors = [];
            paramsRef.current.setStatus(getSnapshotStatus(paramsRef.current.hasCompletedInitialSync, transportLabel));
            paramsRef.current.setError(null);
        },
        noteInitialSyncResponse(msg: WsResponse) {
            if (pendingInitialSyncIds.size === 0 || !isInitialSyncResponse(msg)) {return;}

            pendingInitialSyncIds.delete(msg.id);
            if (msg.status === 'error' && msg.error) {
                initialSyncErrors.push(`${msg.id}: ${msg.error}`);
            }
            if (pendingInitialSyncIds.size > 0) {return;}

            finishSnapshotSync();
        },
    };
}

export function createMessageHandler(paramsRef: ParamsRef, noteInitialSyncResponse: (msg: WsResponse) => void) {
    return (line: string) => {
        const msg = parseMessage(line);
        if (!msg) {return;}

        const params = paramsRef.current;
        if (msg.status === 'ok') {handleOkMessage(msg, params);}
        if (msg.status === 'event') {handleEventMessage(msg, params);}
        if (msg.status === 'error') {handleErrorMessage(msg, params);}
        noteInitialSyncResponse(msg);
    };
}
