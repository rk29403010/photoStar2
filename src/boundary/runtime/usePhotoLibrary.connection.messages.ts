import type { Asset, TimelineGalleryPage } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import type { WsResponse } from '@contracts/schemas';
import { WsResponseSchema } from '@contracts/schemas';
import { applyQuotaNotifications } from '@boundary/runtime/usePhotoLibrary.connection.notifications';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import type { ConnectionStateParams, ParamsRef } from '@boundary/runtime/usePhotoLibrary.connection';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';
import { mergeRefreshedAssetPage } from '@shared/utils/libraryAssetRefresh';
import { buildEventFeedDetail, countPreviewAssets } from '@shared/utils/libraryUiDiagnostics';
import { isTimelineGroupPageRequestId, isTimelineJumpTargetRequestId } from '@shared/utils/libraryTimelineRequestIds';
import { isTimelineGroupId } from '@shared/utils/libraryTimelineGroupId';
import { getAssetUpdateInstruction } from './assetUpdateEvents';
import {
    isAssetPageResponseId,
    isAssetResponseId,
    isReplacementAssetRefreshId,
    isPreservedPagingAssetRefreshId,
    shouldUpdatePagingStateFromAssetResponse,
} from '@shared/utils/libraryPagingState';
import {
    readAssets,
    readBackgroundJobs,
    readDataStats,
    readDomainEvent,
    readFolderHistory,
    readLegacyProgress,
    readPeople,
    readPresentationItems,
    readRecentEvents,
    readRecord,
    readTimelineGalleryPage,
    readTimelineGroupSummaries,
    readTimelineJumpTarget,
    readWorkflowRuns,
    readWorkflowStatus,
} from './usePhotoLibrary.connection.decoders';

const BASE_INITIAL_SYNC_REQUEST_IDS = ['stats-init', 'assets-init'] as const;
const INITIAL_SYNC_REQUEST_ID_SET = new Set<string>(BASE_INITIAL_SYNC_REQUEST_IDS);

type PresentationItemsSetter = (
    value: LibraryPresentationItem[] | ((previous: LibraryPresentationItem[]) => LibraryPresentationItem[]),
) => void;

function isPresentationItemsSetter(value: unknown): value is PresentationItemsSetter {
    return typeof value === 'function';
}

function getPresentationItemsSetter(params: ConnectionStateParams): PresentationItemsSetter | null {
    const record = Object.fromEntries(Object.entries(params));
    return isPresentationItemsSetter(record.setPresentationItems) ? record.setPresentationItems : null;
}

function dedupeAssetsById(assets: Asset[]): Asset[] {
    const deduped = new Map<string, Asset>();
    for (const asset of assets) {deduped.set(asset.id, asset);}
    return Array.from(deduped.values());
}

function dedupePresentationItems(items: LibraryPresentationItem[]): LibraryPresentationItem[] {
    const deduped = new Map<string, LibraryPresentationItem>();
    for (const item of items) {deduped.set(item.presentationKey, item);}
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

function appendPresentationItems(existingItems: LibraryPresentationItem[], incomingItems: LibraryPresentationItem[]) {
    return dedupePresentationItems([...existingItems, ...incomingItems]);
}

function mergeRefreshedPresentationPage(
    existingItems: LibraryPresentationItem[],
    refreshedItems: LibraryPresentationItem[],
): LibraryPresentationItem[] {
    if (existingItems.length === 0) {
        return refreshedItems;
    }
    const refreshedKeys = new Set(refreshedItems.map((item) => item.presentationKey));
    const preservedTail = existingItems
        .slice(Math.max(ASSET_PAGE_SIZE, refreshedItems.length))
        .filter((item) => !refreshedKeys.has(item.presentationKey));
    return [...refreshedItems, ...preservedTail];
}

function createUiFeedId(prefix: string) {
    // eslint-disable-next-line sonarjs/pseudo-random -- non-cryptographic ID generation for UI feeds
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

function decodeTimelineGroupSummaries(data: Record<string, unknown>) {
    const candidateCollections = [data.timelineGroups, data.groupSummaries, data.groups];
    for (const candidate of candidateCollections) {
        const decoded = readTimelineGroupSummaries(candidate);
        if (decoded) {
            return decoded;
        }
    }
    return null;
}

function decodeTimelineGalleryPage(data: Record<string, unknown>) {
    const candidatePages = [data.timelineGroupPage, data.page];
    for (const candidate of candidatePages) {
        const decoded = readTimelineGalleryPage(candidate);
        if (decoded) {
            return decoded;
        }
    }
    return null;
}

function decodeTimelineJumpTarget(data: Record<string, unknown>) {
    const candidateTargets = [data.timelineJumpTarget, data.jumpTarget];
    for (const candidate of candidateTargets) {
        const decoded = readTimelineJumpTarget(candidate);
        if (decoded) {
            return decoded;
        }
    }
    return null;
}

function applySnapshotPayload(data: Record<string, unknown>, params: ConnectionStateParams) {
    const people = readPeople(data.people);
    if (people) {params.setPeople(people);}

    const jobs = readBackgroundJobs(data.jobs);
    if (jobs) {params.setSystemJobs(jobs);}

    const workflowStatus = readWorkflowStatus(data.workflowStatus);
    if (workflowStatus) {params.setWorkflowStatus(workflowStatus);}

    const dataStats = readDataStats(data.dataStats);
    if (dataStats) {params.setDataStats(dataStats);}

    const recentEvents = readRecentEvents(data.recentEvents);
    if (recentEvents) {params.setRecentEvents(recentEvents);}

    const workflowRuns = readWorkflowRuns(data.workflowRuns);
    if (workflowRuns) {params.setWorkflowRuns(workflowRuns);}

    const folderHistory = readFolderHistory(data.folderHistory);
    if (folderHistory) {params.setFolderHistory(folderHistory);}
}

function applyOkPresentationPayload(
    msg: WsResponse,
    params: ConnectionStateParams,
    presentationItems: LibraryPresentationItem[] | null,
) {
    if (msg.id?.startsWith('rejected-assets-')) {
        return;
    }
    const setPresentationItems = getPresentationItemsSetter(params);
    if (!setPresentationItems) {
        return;
    }
    if (!presentationItems) {
        if (!isAssetPageResponseId(msg.id) && !isPreservedPagingAssetRefreshId(msg.id)) {
            setPresentationItems([]);
        }
        return;
    }
    if (isAssetPageResponseId(msg.id)) {
        setPresentationItems((previousItems) => appendPresentationItems(previousItems, presentationItems));
        return;
    }
    if (isPreservedPagingAssetRefreshId(msg.id)) {
        setPresentationItems((previousItems) => mergeRefreshedPresentationPage(previousItems, presentationItems));
        return;
    }
    setPresentationItems(presentationItems);
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
    const timelineGroupSummaries = decodeTimelineGroupSummaries(data);
    if (timelineGroupSummaries) {
        params.setTimelineGroupSummaries(timelineGroupSummaries);
    }

    const timelineGroupPage = decodeTimelineGalleryPage(data);
    if (timelineGroupPage) {
        params.upsertTimelineGroupPage(timelineGroupPage);
    }

    const timelineJumpTarget = decodeTimelineJumpTarget(data);
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
    if (isTimelineGroupId(groupId)) {
        params.connection.setTimelineGroupLoading(groupId, false);
    }
}

function handleOkMessage(msg: WsResponse, params: ConnectionStateParams) {
    const rawData: unknown = msg.data;
    const data = readRecord(rawData);
    if (!data) {return;}
    if (data.message === 'pong') {params.addLog('Pong received');}
    if (typeof data.count === 'number') {params.setStats({ ...data, count: data.count });}
    const { timelineGroupPage } = applyTimelineOkPayload(data, params);
    applySnapshotPayload(data, params);
    applyTimelineResponseFlags({ msg, data, connection: params, timelineGroupPage });

    const assets = readAssets(data.assets);
    if (!assets) {return;}
    applyOkPresentationPayload(msg, params, readPresentationItems(data.presentationItems));
    applyOkAssetPayload(msg, params, dedupeAssetsById(assets));

    if (shouldUpdatePagingStateFromAssetResponse(msg.id) && data.hasMore !== undefined) {
        params.setHasMoreAssets(Boolean(data.hasMore));
    }
}

function handleErrorMessage(msg: WsResponse, params: ConnectionStateParams) {
    if (isAssetPageResponseId(msg.id)) {
        params.setIsLoadingMoreAssets(false);
    }
    if (isTimelineGroupPageResponseId(msg.id)) {
        const rawData: unknown = msg.data;
        const data = readRecord(rawData);
        const groupId = data?.groupId;
        if (isTimelineGroupId(groupId)) {
            params.setTimelineGroupLoading(groupId, false);
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
    const rawData: unknown = msg.data;
    if (msg.id !== 'event_stream') {
        params.updateJobProgress(msg.id, readLegacyProgress(rawData));
        return;
    }

    const event = readRecord(rawData);
    if (!event) {return;}
    const eventType = typeof event.type === 'string' ? event.type : 'UnknownEvent';
    params.addUiFeedEntry({
        id: createUiFeedId('event'),
        timestamp: new Date().toISOString(),
        source: 'event',
        label: eventType,
        detail: buildEventFeedDetail(event),
        requestId: msg.id,
        applied: true,
    });

    const domainEvent = readDomainEvent(rawData);
    if (domainEvent) {
        params.processEvent(domainEvent);
    }
    applyQuotaNotifications(event, params.addNotification);
    applyFaceStats(event, params);
    applyEventAssetUpdates(event, params);
}

function createPendingInitialSyncIds(_includeTimelineGroups: boolean): Set<string> {
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
