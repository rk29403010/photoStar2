import { useCallback, useRef, useState } from 'react';
import type { Asset, LibraryStats, Person } from '@contracts/core';
import type { BackgroundJob, QueueStatusSnapshot, DataStatsSnapshot, RecentEventSnapshot, WorkflowRunListItem } from '@contracts/jobs';
import type { BackendTransport } from '@boundary/transport/usePhotoLibrary.transport';
import type { FolderHistoryItem, LibraryFilter, NotificationItem } from '@contracts/usePhotoLibrary.types';

function loadPersistedPauseState(): boolean {
    try {
        return JSON.parse(localStorage.getItem('ps_system_paused') ?? 'false');
    } catch {
        return false;
    }
}

function usePauseState() {
    const [isSystemPausedState, setIsSystemPausedState] = useState<boolean>(loadPersistedPauseState);
    const setIsSystemPaused = useCallback((isPaused: boolean) => {
        try {
            localStorage.setItem('ps_system_paused', JSON.stringify(isPaused));
        } catch {
            // ignore storage failures
        }
        setIsSystemPausedState(isPaused);
    }, []);

    return { isSystemPaused: isSystemPausedState, setIsSystemPaused };
}

function useNotificationState() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const addNotification = useCallback((type: NotificationItem['type'], message: string) => {
        const id = `notif-${Date.now()}`;
        setNotifications((prev) => [...prev.slice(-9), { id, type, message }]);
    }, []);
    const dismissNotification = useCallback((id: string) => {
        setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, []);

    return { notifications, addNotification, dismissNotification };
}

function useFilterStackState() {
    const [filterStack, setFilterStackState] = useState<LibraryFilter[]>([]);
    const filterStackRef = useRef<LibraryFilter[]>([]);
    const setFilterStack = useCallback((newStack: LibraryFilter[]) => {
        filterStackRef.current = newStack;
        setFilterStackState(newStack);
    }, []);

    return { filterStack, setFilterStackState, setFilterStack, filterStackRef };
}

function useLogState() {
    const [logs, setLogs] = useState<string[]>([]);
    const addLog = useCallback((msg: string) => {
        setLogs((prev) => {
            const next = [...prev, msg];
            return next.length > 50 ? next.slice(-50) : next;
        });
    }, []);

    return { logs, addLog };
}

export function usePhotoLibraryState() {
    const [status, setStatus] = useState('Initializing...');
    const [error, setError] = useState<string | null>(null);
    const [transport, setTransport] = useState<BackendTransport | null>(null);
    const [hasCompletedInitialSync, setHasCompletedInitialSync] = useState(false);
    const [hasMoreAssets, setHasMoreAssets] = useState(true);
    const [isLoadingMoreAssets, setIsLoadingMoreAssets] = useState(false);
    const pauseState = usePauseState();

    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [systemJobs, setSystemJobs] = useState<BackgroundJob[]>([]);
    const [queueStatus, setQueueStatus] = useState<QueueStatusSnapshot | null>(null);
    const [dataStats, setDataStats] = useState<DataStatsSnapshot | null>(null);
    const [recentEvents, setRecentEvents] = useState<RecentEventSnapshot[]>([]);
    const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunListItem[]>([]);
    const [folderHistory, setFolderHistory] = useState<FolderHistoryItem[]>([]);
    const [rejectedAssets, setRejectedAssets] = useState<Asset[]>([]);

    const notificationState = useNotificationState();
    const filterState = useFilterStackState();
    const logState = useLogState();
    const lastScanId = useRef<string | null>(null);

    return {
        status,
        setStatus,
        error,
        setError,
        transport,
        setTransport,
        hasCompletedInitialSync,
        setHasCompletedInitialSync,
        hasMoreAssets,
        setHasMoreAssets,
        isLoadingMoreAssets,
        setIsLoadingMoreAssets,
        ...pauseState,
        stats,
        setStats,
        assets,
        setAssets,
        people,
        setPeople,
        systemJobs,
        setSystemJobs,
        queueStatus,
        setQueueStatus,
        dataStats,
        setDataStats,
        recentEvents,
        setRecentEvents,
        workflowRuns,
        setWorkflowRuns,
        folderHistory,
        setFolderHistory,
        rejectedAssets,
        setRejectedAssets,
        ...notificationState,
        ...filterState,
        lastScanId,
        ...logState,
    };
}
