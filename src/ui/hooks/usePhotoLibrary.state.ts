import { useCallback, useRef, useState } from 'react';
import type { Asset, GalleryTimelineSeek, LibraryStats, Person } from '@contracts/core';
import type { BackgroundJob, DataStatsSnapshot, RecentEventSnapshot, WorkflowRunListItem, WorkflowStatusSnapshot } from '@contracts/jobs';
import type { BackendTransport } from '@boundary/transport/usePhotoLibrary.transport';
import type { FolderHistoryItem, LibraryFilter, NotificationItem, UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import type { GalleryOrder } from './usePhotoLibrary.gallery';
import { appendUiFeedEntry } from '@shared/utils/libraryUiDiagnostics';

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

function useUiFeedState() {
    const [uiFeedEntries, setUiFeedEntries] = useState<UiFeedEntry[]>([]);
    const addUiFeedEntry = useCallback((entry: UiFeedEntry) => {
        setUiFeedEntries((previousEntries) => appendUiFeedEntry(previousEntries, entry));
    }, []);

    return { uiFeedEntries, addUiFeedEntry };
}

function useGallerySeekState() {
    const [galleryTimelineSeek, setGalleryTimelineSeekState] = useState<GalleryTimelineSeek | null>(null);
    const [isSeekingTimeline, setIsSeekingTimeline] = useState(false);
    const gallerySeekRef = useRef<GalleryTimelineSeek | null>(null);
    const setGalleryTimelineSeek = useCallback((seek: GalleryTimelineSeek | null) => {
        gallerySeekRef.current = seek;
        setGalleryTimelineSeekState(seek);
    }, []);

    return { galleryTimelineSeek, isSeekingTimeline, setIsSeekingTimeline, setGalleryTimelineSeek, gallerySeekRef };
}

export function usePhotoLibraryState() {
    const [status, setStatus] = useState('Initializing...');
    const [error, setError] = useState<string | null>(null);
    const [transport, setTransport] = useState<BackendTransport | null>(null);
    const [hasCompletedInitialSync, setHasCompletedInitialSync] = useState(false);
    const [hasMoreAssets, setHasMoreAssets] = useState(true);
    const [isLoadingMoreAssets, setIsLoadingMoreAssets] = useState(false);

    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [systemJobs, setSystemJobs] = useState<BackgroundJob[]>([]);
    const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusSnapshot | null>(null);
    const [dataStats, setDataStats] = useState<DataStatsSnapshot | null>(null);
    const [recentEvents, setRecentEvents] = useState<RecentEventSnapshot[]>([]);
    const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunListItem[]>([]);
    const [folderHistory, setFolderHistory] = useState<FolderHistoryItem[]>([]);
    const [rejectedAssets, setRejectedAssets] = useState<Asset[]>([]);

    const notificationState = useNotificationState();
    const filterState = useFilterStackState();
    const logState = useLogState();
    const uiFeedState = useUiFeedState();
    const lastScanId = useRef<string | null>(null);
    const activeWorkflowRunId = useRef<string | null>(null);
    const workflowRefreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [ingestStatusMessage, setIngestStatusMessage] = useState<string | null>(null);
    const groupSimilarPhotosRef = useRef(true);
    const galleryOrderRef = useRef<GalleryOrder>('default');
    const gallerySeekState = useGallerySeekState();

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
        stats,
        setStats,
        assets,
        setAssets,
        people,
        setPeople,
        systemJobs,
        setSystemJobs,
        workflowStatus,
        setWorkflowStatus,
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
        ...uiFeedState,
        lastScanId,
        activeWorkflowRunId,
        workflowRefreshTimeout,
        groupSimilarPhotosRef,
        galleryOrderRef,
        ...gallerySeekState,
        ...logState,
        ingestStatusMessage,
        setIngestStatusMessage,
    };
}
