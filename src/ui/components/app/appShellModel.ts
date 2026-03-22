import type { BackgroundJob } from '@contracts/jobs';
import type { usePhotoLibrary } from '@ui/hooks/usePhotoLibrary';
import type { useAppUiState } from '@ui/hooks/useAppRuntimeUi';

const ACTIVE_OVERLAY_JOB_STATES = new Set<BackgroundJob['state']>([
    'queued',
    'starting',
    'running',
    'retrying',
]);
const CONNECTION_UNAVAILABLE_STATUS_PREFIXES = [
    'Connecting to backend service',
    'Reconnecting to backend service',
    'Waiting for backend service to become ready',
    'Backend service unavailable',
    'Backend service failed to start',
] as const;

export interface AppActionHandlers {
    shownAssetsCount: number;
    resetLibraryUi: () => void;
    handleViewChange: (next: ReturnType<typeof useAppUiState>['view']) => void;
    handleRefresh: () => void;
    handleDeclusterSelection: (personId: string) => void;
    handleToggleRejected: (personId: string) => void;
    handleFilterBack: () => void;
    handleClearAllFilters: () => void;
    handleUntagAsset: (assetId: string, personId: string) => void;
    handlePeopleFilter: (filter: Parameters<ReturnType<typeof usePhotoLibrary>['actions']['pushFilter']>[0]) => void;
    handleOpenAlbum: (albumId: string, albumTitle: string) => void;
    handleScan: (specificPath?: string) => Promise<void>;
    handleOverlayRefresh: () => void;
    handleFaceClick: (personId: string, personName: string) => void;
    handleOpenSettingsFromPhoto: () => void;
}

export interface ConnectionUiState {
    backendReady: boolean;
    shellStyle: {
        display: 'flex';
        flexDirection: 'column';
        flex: number;
        minHeight: number;
        opacity?: number;
        filter?: string;
        pointerEvents?: 'none';
        userSelect?: 'none';
    };
    connectionOverlay: {
        title: string;
        message: string;
        tone: 'warning' | 'info';
    } | null;
}

function getShellStyle(uiBlocked: boolean): ConnectionUiState['shellStyle'] {
    if (!uiBlocked) {
        return { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 };
    }

    return {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        opacity: 0.38,
        filter: 'grayscale(0.9)',
        pointerEvents: 'none',
        userSelect: 'none',
    };
}

function isConnectionUnavailableStatus(status: string) {
    return CONNECTION_UNAVAILABLE_STATUS_PREFIXES.some((prefix) => status.startsWith(prefix));
}

export function getConnectionUiState(status: string, error: string | null): ConnectionUiState {
    const backendReady = !isConnectionUnavailableStatus(status);
    if (backendReady) {
        return { backendReady, shellStyle: getShellStyle(false), connectionOverlay: null };
    }

    return {
        backendReady,
        shellStyle: getShellStyle(true),
        connectionOverlay: {
            title: 'Backend Service Unavailable',
            message: error ?? 'Attempting to restore the backend service connection...',
            tone: error ? 'warning' : 'info',
        },
    };
}

export function getActiveOverlayJobs(jobs: BackgroundJob[]) {
    return jobs.filter((job) => ACTIVE_OVERLAY_JOB_STATES.has(job.state));
}
