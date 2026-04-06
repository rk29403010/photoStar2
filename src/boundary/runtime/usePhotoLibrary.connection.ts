import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Command, type Child } from '@tauri-apps/plugin-shell';
import type { Asset, GalleryTimelineSeek, LibraryStats, Person } from '@contracts/core';
import type { BackgroundJob, DataStatsSnapshot, RecentEventSnapshot, WorkflowRunListItem, WorkflowStatusSnapshot } from '@contracts/jobs';
import { getBackendTransportKind, getBackendWsUrl } from '@boundary/runtime/backend';
import type { DomainEvent } from '@contracts/events';
import {
    createStreamLineHandler,
    createTauriBackendTransport,
    createWebSocketBackendTransport,
    type BackendTransport,
} from '@boundary/transport/usePhotoLibrary.transport';
import type { FolderHistoryItem, LibraryFilter, UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';
import { createMessageHandler, createSnapshotSyncController, currentFilter } from '@boundary/runtime/usePhotoLibrary.connection.messages';
import { getRetryState } from '@boundary/runtime/usePhotoLibrary.connection.retry';
import type { GalleryOrder } from '@ui/hooks/usePhotoLibrary.gallery';

const FAST_RECONNECT_WINDOW_MS = 5000;
const INITIAL_STARTUP_TIMEOUT_MS = 10000;
const FAST_RECONNECT_DELAYS_MS = [400, 900, 1600, 2500];
const SLOW_RECONNECT_DELAY_MS = 6000;

export interface ConnectionStateParams {
    hasCompletedInitialSync: boolean;
    setHasCompletedInitialSync: (value: boolean) => void;
    setHasMoreAssets: (value: boolean) => void;
    setIsLoadingMoreAssets: (value: boolean) => void;
    setStatus: (value: string) => void;
    setError: (value: string | null) => void;
    setTransport: Dispatch<SetStateAction<BackendTransport | null>>;
    setStats: Dispatch<SetStateAction<LibraryStats | null>>;
    setAssets: Dispatch<SetStateAction<Asset[]>>;
    setPeople: Dispatch<SetStateAction<Person[]>>;
    setSystemJobs: Dispatch<SetStateAction<BackgroundJob[]>>;
    setWorkflowStatus: Dispatch<SetStateAction<WorkflowStatusSnapshot | null>>;
    setDataStats: Dispatch<SetStateAction<DataStatsSnapshot | null>>;
    setRecentEvents: Dispatch<SetStateAction<RecentEventSnapshot[]>>;
    setWorkflowRuns: Dispatch<SetStateAction<WorkflowRunListItem[]>>;
    setFolderHistory: Dispatch<SetStateAction<FolderHistoryItem[]>>;
    setRejectedAssets: Dispatch<SetStateAction<Asset[]>>;
    addUiFeedEntry: (entry: UiFeedEntry) => void;
    addNotification: (type: 'warning' | 'info', message: string) => void;
    addLog: (message: string) => void;
    processEvent: (event: DomainEvent) => void;
    updateJobProgress: (jobId: string, payload: { processed?: number; total?: number; message?: string; current?: string; status?: string }) => void;
    refreshAssetById?: (assetId: string) => void;
    filterStackRef: { current: LibraryFilter[] };
    groupSimilarPhotosRef: { current: boolean };
    galleryOrderRef: { current: GalleryOrder };
    gallerySeekRef: { current: GalleryTimelineSeek | null };
}

export type ParamsRef = { current: ConnectionStateParams };
type ActiveJobs = { ws: WebSocket | null; child: Child | null };
type StartConnectionDeps = {
    paramsRef: ParamsRef;
    handleBackendMessage: (line: string) => void;
    activeJobs: ActiveJobs;
    onTransportConnected: (transportLabel: string) => void;
    scheduleReconnect: (message: string, status: string) => void;
    isSessionStale: () => boolean;
};

type ConnectionLifecycleState = {
    reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    cleaningUp: boolean;
    startupFailed: boolean;
    reconnectAttempt: number;
    disconnectedAt: number | null;
    connectionSessionId: number;
};

type ConnectionLifecycleContext = {
    paramsRef: ParamsRef;
    activeJobs: ActiveJobs;
    snapshotSync: ReturnType<typeof createSnapshotSyncController>;
    handleBackendMessage: (line: string) => void;
    state: ConnectionLifecycleState;
};

async function sendInitialRequests(
    write: (payload: string) => void | Promise<void>,
    filter: LibraryFilter | undefined,
    withGroupCounts: boolean,
    galleryOrder: GalleryOrder,
) {
    await write(JSON.stringify({ id: '1', command: 'ping', payload: {} }) + '\n');
    await write(JSON.stringify({ id: 'stats-init', command: 'get_stats', payload: {} }) + '\n');
    await write(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: ASSET_PAGE_SIZE, offset: 0, filter, detailLevel: 'gallery', galleryOrder, withGroupCounts } }) + '\n');
    await write(JSON.stringify({ id: 'people-init', command: 'get_people', payload: {} }) + '\n');
    await write(JSON.stringify({ id: 'system-jobs-init', command: 'get_system_jobs', payload: {} }) + '\n');
}

function clearSocketHandlers(ws: WebSocket) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
}

function closeSocket(ws: WebSocket | null) {
    if (!ws) {return;}
    clearSocketHandlers(ws);
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
}

async function killChildProcess(child: Child | null) {
    if (!child) {return;}
    await child.kill().catch(() => undefined);
}

async function startWebSocketMode(deps: StartConnectionDeps) {
    deps.paramsRef.current.addLog('Connecting to backend service via WebSocket...');
    const ws = new WebSocket(getBackendWsUrl());
    deps.activeJobs.ws = ws;

    ws.onopen = async () => {
        if (deps.isSessionStale()) {
            closeSocket(ws);
            return;
        }

        deps.paramsRef.current.addLog('WebSocket connected.');
        deps.paramsRef.current.setTransport(createWebSocketBackendTransport(ws));
        deps.onTransportConnected('WS');

        try {
            await sendInitialRequests(
                (payload) => ws.send(payload),
                currentFilter(deps.paramsRef.current.filterStackRef),
                deps.paramsRef.current.groupSimilarPhotosRef.current,
                deps.paramsRef.current.galleryOrderRef.current,
            );
        } catch (error) {
            if (deps.isSessionStale()) {return;}
            deps.scheduleReconnect('Failed to request initial library data.', `Initial sync failed: ${String(error)}`);
        }
    };

    ws.onmessage = (event) => {
        if (deps.isSessionStale()) {return;}
        deps.handleBackendMessage(String(event.data));
    };

    ws.onclose = () => {
        if (deps.activeJobs.ws !== ws) {
            return;
        }

        deps.activeJobs.ws = null;
        deps.paramsRef.current.setTransport(null);
        if (deps.isSessionStale()) {return;}

        deps.scheduleReconnect('Lost connection to backend server.', 'Backend service unavailable');
    };

    ws.onerror = () => {
        if (deps.isSessionStale()) {return;}
        deps.paramsRef.current.addLog('WebSocket connection error.');
    };
}

async function startTauriMode(deps: StartConnectionDeps) {
    try {
        deps.paramsRef.current.addLog('Starting packaged backend service...');
        const command = Command.sidecar('binaries/core');
        const handleStdoutChunk = createStreamLineHandler(deps.handleBackendMessage);
        const handleStderrChunk = createStreamLineHandler((line) => deps.paramsRef.current.addLog(`CORE ERR: ${line}`));
        let spawnedChild: Child | null = null;

        command.on('close', (data) => {
            if (deps.activeJobs.child !== spawnedChild) {
                return;
            }

            deps.activeJobs.child = null;
            deps.paramsRef.current.setTransport(null);
            if (deps.isSessionStale()) {return;}

            deps.scheduleReconnect('Backend service terminated.', `Backend service closed with code ${data.code}`);
        });
        command.on('error', (err) => {
            if (deps.activeJobs.child !== spawnedChild) {
                return;
            }

            deps.activeJobs.child = null;
            deps.paramsRef.current.setTransport(null);
            if (deps.isSessionStale()) {return;}

            deps.scheduleReconnect('Backend service error.', `Backend service error: ${String(err)}`);
        });

        command.stdout.on('data', handleStdoutChunk);
        command.stderr.on('data', handleStderrChunk);

        const process = await command.spawn();
        spawnedChild = process;
        if (deps.isSessionStale()) {
            await process.kill();
            return;
        }

        deps.activeJobs.child = process;
        deps.paramsRef.current.setTransport(createTauriBackendTransport(process, command.stdout));
        deps.paramsRef.current.addLog('Packaged backend service started.');
        deps.onTransportConnected('Tauri');

        try {
            await sendInitialRequests(
                (payload) => process.write(payload),
                currentFilter(deps.paramsRef.current.filterStackRef),
                deps.paramsRef.current.groupSimilarPhotosRef.current,
                deps.paramsRef.current.galleryOrderRef.current,
            );
        } catch (error) {
            if (deps.isSessionStale()) {return;}
            deps.scheduleReconnect('Failed to request initial library data.', `Initial sync failed: ${String(error)}`);
        }
    } catch (error) {
        if (deps.isSessionStale()) {return;}
        deps.scheduleReconnect('Backend service start failed.', `Failed to launch packaged backend service: ${String(error)}`);
    }
}

function getReconnectDelayMs(disconnectedAt: number, attempt: number): number {
    const elapsedMs = Date.now() - disconnectedAt;
    if (elapsedMs < FAST_RECONNECT_WINDOW_MS) {
        const fastIndex = Math.min(attempt, FAST_RECONNECT_DELAYS_MS.length - 1);
        return FAST_RECONNECT_DELAYS_MS[fastIndex];
    }
    return SLOW_RECONNECT_DELAY_MS;
}

function isLifecycleStopped(state: ConnectionLifecycleState): boolean {
    return state.cleaningUp || state.startupFailed;
}

function clearLifecycleReconnectTimeout(state: ConnectionLifecycleState) {
    if (!state.reconnectTimeout) {return;}
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = undefined;
}

function clearActiveJobs(activeJobs: ActiveJobs) {
    const ws = activeJobs.ws;
    const child = activeJobs.child;
    activeJobs.ws = null;
    activeJobs.child = null;
    return { ws, child };
}

function disposeActiveJobs(ctx: ConnectionLifecycleContext) {
    const { ws, child } = clearActiveJobs(ctx.activeJobs);
    closeSocket(ws);
    void killChildProcess(child);
    ctx.paramsRef.current.setTransport(null);
}

function shouldFailStartup(ctx: ConnectionLifecycleContext): boolean {
    return getBackendTransportKind() === 'ipc'
        && !ctx.state.cleaningUp
        && !ctx.state.startupFailed
        && !ctx.paramsRef.current.hasCompletedInitialSync
        && ctx.activeJobs.ws?.readyState !== WebSocket.OPEN
        && ctx.activeJobs.child === null;
}

function markStartupFailure(ctx: ConnectionLifecycleContext) {
    if (!shouldFailStartup(ctx)) {
        return;
    }

    ctx.state.startupFailed = true;
    ctx.state.connectionSessionId += 1;
    clearLifecycleReconnectTimeout(ctx.state);
    disposeActiveJobs(ctx);
    ctx.paramsRef.current.setStatus('Backend service failed to start.');
    ctx.paramsRef.current.setError('Backend service failed to start within 10s. Check the core logs, then refresh.');
    ctx.paramsRef.current.addLog('Backend service startup timed out after 10s.');
}

function createStartupFailureTimeout(ctx: ConnectionLifecycleContext) {
    return setTimeout(() => {
        markStartupFailure(ctx);
    }, INITIAL_STARTUP_TIMEOUT_MS);
}

function beginConnectionAttempt(ctx: ConnectionLifecycleContext): number {
    clearLifecycleReconnectTimeout(ctx.state);
    ctx.state.connectionSessionId += 1;
    disposeActiveJobs(ctx);
    ctx.paramsRef.current.setStatus(
        ctx.paramsRef.current.hasCompletedInitialSync
            ? 'Reconnecting to backend service...'
            : 'Connecting to backend service...'
    );
    return ctx.state.connectionSessionId;
}

function handleTransportConnected(ctx: ConnectionLifecycleContext, startupFailureTimeout: ReturnType<typeof setTimeout>, transportLabel: string) {
    clearTimeout(startupFailureTimeout);
    ctx.state.reconnectAttempt = 0;
    ctx.state.disconnectedAt = null;
    ctx.snapshotSync.beginSnapshotSync(transportLabel);
}

function createStartConnectionDeps(ctx: ConnectionLifecycleContext, startupFailureTimeout: ReturnType<typeof setTimeout>, scheduleReconnect: (message: string, status: string) => void, sessionId: number): StartConnectionDeps {
    return {
        paramsRef: ctx.paramsRef,
        handleBackendMessage: ctx.handleBackendMessage,
        activeJobs: ctx.activeJobs,
        onTransportConnected: (transportLabel) => handleTransportConnected(ctx, startupFailureTimeout, transportLabel),
        scheduleReconnect,
        isSessionStale: () => ctx.state.cleaningUp || sessionId !== ctx.state.connectionSessionId,
    };
}

async function startConfiguredTransport(deps: StartConnectionDeps) {
    if (getBackendTransportKind() === 'ipc') {
        await startTauriMode(deps);
        return;
    }

    await startWebSocketMode(deps);
}

function createReconnectScheduler(ctx: ConnectionLifecycleContext, startConnection: () => Promise<void>) {
    return (message: string, status: string) => {
        if (isLifecycleStopped(ctx.state)) {return;}

        if (ctx.state.disconnectedAt === null) {
            ctx.state.disconnectedAt = Date.now();
        }

        const delayMs = getReconnectDelayMs(ctx.state.disconnectedAt, ctx.state.reconnectAttempt);
        ctx.state.reconnectAttempt += 1;
        clearLifecycleReconnectTimeout(ctx.state);

        const retryState = getRetryState(ctx.paramsRef, delayMs, message, status);
        ctx.paramsRef.current.setStatus(retryState.status);
        ctx.paramsRef.current.setError(retryState.error);
        ctx.paramsRef.current.addLog(retryState.logMessage);
        ctx.state.reconnectTimeout = setTimeout(() => {
            void startConnection();
        }, delayMs);
    };
}

function cleanupConnectionLifecycle(ctx: ConnectionLifecycleContext, startupFailureTimeout: ReturnType<typeof setTimeout>) {
    ctx.state.cleaningUp = true;
    clearTimeout(startupFailureTimeout);
    clearLifecycleReconnectTimeout(ctx.state);
    disposeActiveJobs(ctx);
}

function createConnectionLifecycle(paramsRef: ParamsRef) {
    const ctx: ConnectionLifecycleContext = {
        paramsRef,
        activeJobs: { ws: null, child: null },
        snapshotSync: createSnapshotSyncController(paramsRef),
        handleBackendMessage: () => undefined,
        state: {
            reconnectTimeout: undefined,
            cleaningUp: false,
            startupFailed: false,
            reconnectAttempt: 0,
            disconnectedAt: null,
            connectionSessionId: 0,
        },
    };

    ctx.handleBackendMessage = createMessageHandler(paramsRef, ctx.snapshotSync.noteInitialSyncResponse);

    const startupFailureTimeout = createStartupFailureTimeout(ctx);
    const startConnection = async () => {
        if (isLifecycleStopped(ctx.state)) {return;}

        const sessionId = beginConnectionAttempt(ctx);
        const deps = createStartConnectionDeps(ctx, startupFailureTimeout, scheduleReconnect, sessionId);
        await startConfiguredTransport(deps);
    };
    const scheduleReconnect = createReconnectScheduler(ctx, startConnection);

    void startConnection();

    return () => {
        cleanupConnectionLifecycle(ctx, startupFailureTimeout);
    };
}

export function usePhotoLibraryConnection(params: ConnectionStateParams) {
    const paramsRef = useRef(params);

    useEffect(() => {
        paramsRef.current = params;
    }, [params]);

    useEffect(() => createConnectionLifecycle(paramsRef), []);
}
