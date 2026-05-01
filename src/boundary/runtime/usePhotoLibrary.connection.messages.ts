import type { Asset, Person, TimelineGalleryPage, TimelineGroupId, TimelineGroupSummary, TimelineJumpTarget } from '@contracts/core';
import type { BackgroundJob, DataStatsSnapshot, RecentEventSnapshot, WorkflowRunListItem, WorkflowStatusSnapshot } from '@contracts/jobs';
import type { WsResponse } from '@contracts/schemas';
import { WsResponseSchema } from '@contracts/schemas';
import type { DomainEvent } from '@contracts/events';
import { applyQuotaNotifications } from '@boundary/runtime/usePhotoLibrary.connection.notifications';
import type { FolderHistoryItem, LibraryFilter } from '@contracts/usePhotoLibrary.types';
import type { ConnectionStateParams, ParamsRef } from '@boundary/runtime/usePhotoLibrary.connection';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';
import { mergeRefreshedAssetPage } from '@shared/utils/libraryAssetRefresh';
import { buildEventFeedDetail, countPreviewAssets } from '@shared/utils/libraryUiDiagnostics';
import { isTimelineGroupPageRequestId, isTimelineJumpTargetRequestId } from '@shared/utils/libraryTimelineRequestIds';
import { getAssetUpdateInstruction } from './assetUpdateEvents';
import {
    isAssetPageResponseId,
    isAssetResponseId,
    isReplacementAssetRefreshId,
    isPreservedPagingAssetRefreshId,
    shouldUpdatePagingStateFromAssetResponse,
} from '@shared/utils/libraryPagingState';

const BASE_INITIAL_SYNC_REQUEST_IDS = ['stats-init', 'assets-init'] as const;
const INITIAL_SYNC_REQUEST_ID_SET = new Set<string>(BASE_INITIAL_SYNC_REQUEST_IDS);

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

function appendAssets(existingAssets: Asset[], incomingAssets: Asset[]) {
    return dedupeAssetsById([...existingAssets, ...incomingAssets]);
}

function createUiFeedId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeAssetIds(assets: Asset[]): string {
    return assets.slice(0, 5).map((asset) => asset.id).join(',');
}

function summarizePreviewAssetIds(assets: Asset[]): string {
    return assets.filter((asset) => Boolean(asset.preview_path)).slice(0, 5).map((asset) => asset.id).join(',');
}

function getAssetResponseLabel(id: string | undefined, hasCompletedInitialSync: boolean): string {
    if (isAssetPageResponseId(id)) {
        return 'Assets page response';
    }
    if (id === 'assets-init') {
        return hasCompletedInitialSync ? 'Assets re-sync response' : 'Assets initial sync';
    }
    return 'Assets refresh response';
}

function isTimelineGroupPageResponseId(id: string | undefined): boolean {
    return isTimelineGroupPageRequestId(id);
}

function isTimelineJumpTargetResponseId(id: string | undefined): boolean {
    return isTimelineJumpTargetRequestId(id);
}

function isTimelineGroupSummary(value: unknown): value is TimelineGroupSummary {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<TimelineGroupSummary>;
    return typeof candidate.id === 'string'
        && typeof candidate.label === 'string'
        && typeof candidate.sortKey === 'string'
        && typeof candidate.itemCount === 'number'
        && typeof candidate.isLoaded === 'boolean';
}

function isTimelineGalleryPage(value: unknown): value is TimelineGalleryPage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<TimelineGalleryPage>;
    return typeof candidate.groupId === 'string'
        && Array.isArray(candidate.items)
        && typeof candidate.isFullyLoaded === 'boolean'
        && (typeof candidate.nextCursor === 'string' || candidate.nextCursor === null);
}

function isTimelineJumpTarget(value: unknown): value is TimelineJumpTarget {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<TimelineJumpTarget>;
    return typeof candidate.groupId === 'string';
}

function readTimelineGroupSummaries(data: Record<string, unknown>) {
    const candidateCollections = [data.timelineGroups, data.groupSummaries, data.groups];
    for (const candidate of candidateCollections) {
        if (Array.isArray(candidate) && candidate.every(isTimelineGroupSummary)) {
            return candidate;
        }
    }
    return null;
}

function readTimelineGalleryPage(data: Record<string, unknown>) {
    const candidatePages = [data.timelineGroupPage, data.page];
    for (const candidate of candidatePages) {
        if (isTimelineGalleryPage(candidate)) {
            return candidate;
        }
    }
    return null;
}

function readTimelineJumpTarget(data: Record<string, unknown>) {
    const candidateTargets = [data.timelineJumpTarget, data.jumpTarget];
    for (const candidate of candidateTargets) {
        if (isTimelineJumpTarget(candidate)) {
            return candidate;
        }
    }
    return null;
}

function applySnapshotPayload(data: Record<string, unknown>, params: ConnectionStateParams) {
    if (data.people) {params.setPeople(data.people as Person[]);}
    if (data.jobs) {params.setSystemJobs(data.jobs as BackgroundJob[]);}
    if (data.workflowStatus) {params.setWorkflowStatus(data.workflowStatus as WorkflowStatusSnapshot);}
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

    if (!isAssetPageResponseId(msg.id)) {
        params.setIsSeekingTimeline(false);
    }
    if (isReplacementAssetRefreshId(msg.id)) {
        params.setIsRefreshingLibrary(false);
    }

    let previousAssetCount = 0;
    let nextAssetCount = 0;
    let nextPreviewCount = 0;
    const incomingPreviewCount = countPreviewAssets(assets);

    if (isAssetPageResponseId(msg.id)) {
        params.setAssets((previousAssets) => {
            previousAssetCount = previousAssets.length;
            const nextAssets = appendAssets(previousAssets, assets);
            nextAssetCount = nextAssets.length;
            nextPreviewCount = countPreviewAssets(nextAssets);
            return nextAssets;
        });
        params.setIsLoadingMoreAssets(false);
    } else if (isPreservedPagingAssetRefreshId(msg.id)) {
        params.setAssets((previousAssets) => {
            previousAssetCount = previousAssets.length;
            const nextAssets = mergeRefreshedAssetPage(previousAssets, assets, {
                replaceWindowSize: ASSET_PAGE_SIZE,
            });
            nextAssetCount = nextAssets.length;
            nextPreviewCount = countPreviewAssets(nextAssets);
            return nextAssets;
        });
    } else {
        params.setAssets((previousAssets) => {
            previousAssetCount = previousAssets.length;
            nextAssetCount = assets.length;
            nextPreviewCount = incomingPreviewCount;
            return assets;
        });
    }

    params.addUiFeedEntry({
        id: createUiFeedId('asset-response'),
        timestamp: new Date().toISOString(),
        source: 'asset_response',
        label: getAssetResponseLabel(msg.id, params.hasCompletedInitialSync),
        detail: `incoming=${assets.length}; incomingPreviews=${incomingPreviewCount}; pageIds=[${summarizeAssetIds(assets)}]; previewIds=[${summarizePreviewAssetIds(assets)}]; next=${nextAssetCount}; nextPreviews=${nextPreviewCount}`,
        requestId: msg.id,
        assetCount: assets.length,
        previewCount: incomingPreviewCount,
        previousAssetCount,
        nextAssetCount,
        applied: true,
    });
}

function applyTimelineOkPayload(data: Record<string, unknown>, params: ConnectionStateParams) {
    const timelineGroupSummaries = readTimelineGroupSummaries(data);
    if (timelineGroupSummaries) {
        params.setTimelineGroupSummaries(timelineGroupSummaries);
    }

    const timelineGroupPage = readTimelineGalleryPage(data);
    if (timelineGroupPage) {
        params.upsertTimelineGroupPage(timelineGroupPage);
    }

    const timelineJumpTarget = readTimelineJumpTarget(data);
    if (timelineJumpTarget) {
        params.setTimelineActiveJumpTarget(timelineJumpTarget);
    }

    return { timelineGroupPage };
}

function applyTimelineResponseFlags(params: {
    msg: WsResponse;
    data: Record<string, unknown>;
    connection: ConnectionStateParams;
    timelineGroupPage: TimelineGalleryPage | null;
}) {
    if (isTimelineJumpTargetResponseId(params.msg.id)) {
        params.connection.setIsSeekingTimeline(false);
    }

    if (!isTimelineGroupPageResponseId(params.msg.id)) {
        return;
    }

    const groupId = params.timelineGroupPage?.groupId ?? params.data.groupId;
    if (typeof groupId === 'string') {
        params.connection.setTimelineGroupLoading(groupId as TimelineGroupId, false);
    }
}

function handleOkMessage(msg: WsResponse, params: ConnectionStateParams) {
    const data = msg.data;
    if (!data) {return;}
    if (data.message === 'pong') {params.addLog('Pong received');}
    if (data.count !== undefined) {params.setStats(data);}
    const { timelineGroupPage } = applyTimelineOkPayload(data, params);
    applySnapshotPayload(data, params);
    applyTimelineResponseFlags({ msg, data, connection: params, timelineGroupPage });
    if (!data.assets) {return;}

    const assets = dedupeAssetsById(data.assets as Asset[]);
    applyOkAssetPayload(msg, params, assets);

    if (shouldUpdatePagingStateFromAssetResponse(msg.id) && data.hasMore !== undefined) {
        params.setHasMoreAssets(Boolean(data.hasMore));
    }
}

function handleErrorMessage(msg: WsResponse, params: ConnectionStateParams) {
    if (isAssetPageResponseId(msg.id)) {
        params.setIsLoadingMoreAssets(false);
    }
    if (isTimelineGroupPageResponseId(msg.id)) {
        const groupId = msg.data?.groupId;
        if (typeof groupId === 'string') {
            params.setTimelineGroupLoading(groupId as TimelineGroupId, false);
        }
    }
    if (isReplacementAssetRefreshId(msg.id)) {
        params.setIsRefreshingLibrary(false);
        params.setIsSeekingTimeline(false);
    }
    if (isTimelineJumpTargetResponseId(msg.id)) {
        params.setIsSeekingTimeline(false);
        params.setTimelineActiveJumpTarget(null);
    }
    if (!msg.error) {return;}
    params.addLog(`Command ${msg.id ?? 'unknown'} failed: ${msg.error}`);
    if (isAssetResponseId(msg.id)) {
        params.addUiFeedEntry({
            id: createUiFeedId('asset-response-error'),
            timestamp: new Date().toISOString(),
            source: 'asset_response',
            label: 'Assets response failed',
            detail: msg.error,
            requestId: msg.id,
            applied: false,
        });
    }
}

function applyMediaDiscoveredEvent(event: Record<string, unknown>, params: ConnectionStateParams) {
    params.setStats((prev) => ({
        ...prev,
        count: (prev?.count ?? 0) + 1,
        processed_faces: prev?.processed_faces,
    }));
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
    const instruction = getAssetUpdateInstruction(event);
    if (!instruction) {
        return;
    }

    if (instruction.kind === 'refresh') {
        params.refreshAssetById?.(instruction.assetId);
        return;
    }

    const updated = instruction.asset;
    params.setAssets((prev) => {
        let found = false;
        const next = prev.map((asset) => {
            if (asset.id !== updated.id) {
                return asset;
            }

            found = true;
            return { ...asset, ...updated };
        });
        if (!found) {
            params.refreshAssetById?.(updated.id);
        }
        return dedupeAssetsById(next);
    });
}

function applyEventAssetUpdates(event: Record<string, unknown>, params: ConnectionStateParams) {
    if (event.type === 'MediaDiscovered') {
        applyMediaDiscoveredEvent(event, params);
        return;
    }

    if (event.type === 'PreviewGenerated' || event.type === 'WorkflowPreviewGenerated') {
        applyMappedAssetUpdate(event.mediaId, params, (asset) => ({ ...asset, preview_path: String(event.path) }));
        return;
    }

    if (event.type === 'SensitivityScored') {
        applyMappedAssetUpdate(event.mediaId, params, (asset) => ({ ...asset, sensitivity_score: Number(event.score) }));
        return;
    }

    if (event.type === 'AssetUpdated') {
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
    params.addUiFeedEntry({
        id: createUiFeedId('event'),
        timestamp: new Date().toISOString(),
        source: 'event',
        label: String(event.type ?? 'UnknownEvent'),
        detail: buildEventFeedDetail(event),
        requestId: msg.id,
        applied: true,
    });

    params.processEvent(event as DomainEvent);
    applyQuotaNotifications(event, params.addNotification);
    applyFaceStats(event, params);
    applyEventAssetUpdates(event, params);
}

function createPendingInitialSyncIds(includeTimelineGroups: boolean): Set<string> {
    void includeTimelineGroups;
    return new Set<string>(BASE_INITIAL_SYNC_REQUEST_IDS);
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
    let pendingInitialSyncIds = createPendingInitialSyncIds(false);
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
        beginSnapshotSync(transportLabel: string, options: { includeTimelineGroups?: boolean } = {}) {
            activeTransportLabel = transportLabel;
            pendingInitialSyncIds = createPendingInitialSyncIds(options.includeTimelineGroups === true);
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
