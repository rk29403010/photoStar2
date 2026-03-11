import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import type { BackgroundJob, DataStatsSnapshot, JobErrorSnapshot, QueueStatusSnapshot, RecentEventSnapshot } from '@contracts/jobs';
import { DataStatsPanel } from './dashboard/DataStatsPanel';
import { JobCard } from './dashboard/JobCard';
import { QueueStatusTable } from './dashboard/QueueStatusTable';
import { RecentEventsPanel } from './dashboard/RecentEventsPanel';
import { SystemErrorsPanel } from './dashboard/SystemErrorsPanel';

interface DashboardViewProps {
    jobs: BackgroundJob[];
    systemJobs: BackgroundJob[];
    queueStatus: QueueStatusSnapshot | null;
    dataStats: DataStatsSnapshot | null;
    recentEvents: RecentEventSnapshot[];
    refreshSystemJobs: () => void;
    isSystemPaused: boolean;
    onTogglePause: () => void;
    onStopJob: (jobId: string) => void;
    onGetEventPayloadRaw: (eventId: string) => Promise<string>;
    onGetJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }) => Promise<JobErrorSnapshot>;
    onSetModulePaused: (moduleId: string, paused: boolean) => void;
    loading?: boolean;
}

type DashboardTab = 'modules' | 'queues' | 'data' | 'events' | 'errors';
type DashboardJobWithIndex = { job: BackgroundJob; index: number };
const DASHBOARD_MODULE_GRID_STYLE = {
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
};
const ACTIVE_TAB_STYLE = {
    backgroundColor: 'rgba(8, 145, 178, 0.2)',
    borderColor: 'rgba(6, 182, 212, 0.4)',
    color: '#67e8f9',
};
const INACTIVE_TAB_STYLE = {
    backgroundColor: '#111827',
    borderColor: '#374151',
    color: '#d1d5db',
};
const PAUSE_ALL_STYLE = {
    backgroundColor: '#1f2937',
    borderColor: '#374151',
    color: '#d1d5db',
};
const RESUME_ALL_STYLE = {
    backgroundColor: 'rgba(120, 53, 15, 0.3)',
    borderColor: 'rgba(180, 83, 9, 0.5)',
    color: '#fbbf24',
};

type DashboardErrorsState = {
    snapshot: JobErrorSnapshot | null;
    loading: boolean;
    moduleFilter: string | null;
    page: number;
    setModuleFilter: (moduleId: string | null) => void;
    setPage: (page: number) => void;
    openForModule: (moduleId: string) => void;
};

const SKELETON_SYSTEM_JOBS: BackgroundJob[] = [
    { id: 'class-onboarding', stage: 'onboarding', title: 'Photo Onboarding', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-previews', stage: 'previews', title: 'Thumbnail Generation', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-detection', stage: 'analysis', title: 'Face Detection', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-mapping', stage: 'analysis', title: 'Face Recognition', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-clustering', stage: 'analysis', title: 'Face Clustering', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-sensitive', stage: 'sensitive_scan', title: 'Sensitive Content Scan', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-aimetadata-3f', stage: 'ai_metadata_v2_3f', title: 'AI Metadata V2 (Gemini 3F)', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-aimetadata-31p', stage: 'ai_metadata_v2_31p', title: 'AI Metadata V2 Upgrade (Gemini 31P)', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
];

const SYSTEM_STAGES = ['onboarding', 'bulk_ingest', 'previews', 'preview_generation', 'analysis', 'face_analysis', 'scan', 'ai_metadata', 'ai_metadata_3f', 'ai_metadata_31p', 'ai_metadata_v2_3f', 'ai_metadata_v2_31p', 'sensitive_scan'];
const DASHBOARD_STATE_PRIORITY: Record<BackgroundJob['state'], number> = {
    running: 0,
    starting: 0,
    retrying: 0,
    queued: 1,
    paused: 2,
    idle: 3,
    completed: 4,
    failed: 5,
    cancelled: 5,
};

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors ${active ? 'border-cyan-500/40 bg-cyan-600/20 text-cyan-300' : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'}`}
        style={active ? ACTIVE_TAB_STYLE : INACTIVE_TAB_STYLE}
    >
        {label}
    </button>
);

function getActiveTabCount(params: {
    activeTab: DashboardTab;
    moduleCount: number;
    queueCount: number;
    dataCount: number;
    eventCount: number;
    errorCount: number;
}) {
    const { activeTab, moduleCount, queueCount, dataCount, eventCount, errorCount } = params;
    if (activeTab === 'modules') {return `${moduleCount} MODULES`;}
    if (activeTab === 'queues') {return `${queueCount} QUEUES`;}
    if (activeTab === 'data') {return `${dataCount} METRICS`;}
    if (activeTab === 'events') {return `${eventCount} EVENTS`;}
    return `${errorCount} ERRORS`;
}

const DashboardHeader: React.FC<{
    loading?: boolean;
    isSystemPaused: boolean;
    onTogglePause: () => void;
    activeTab: DashboardTab;
    moduleCount: number;
    queueCount: number;
    dataCount: number;
    eventCount: number;
    errorCount: number;
    onSelectTab: (tab: DashboardTab) => void;
}> = ({ loading, isSystemPaused, onTogglePause, activeTab, moduleCount, queueCount, dataCount, eventCount, errorCount, onSelectTab }) => (
    <div className="flex flex-col gap-4 border-b border-gray-800 pb-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-2xl font-light uppercase tracking-wide text-gray-100">System Dashboard</h2>
                {loading && <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] tracking-widest text-cyan-500 animate-pulse">INITIALISING DATA...</span>}
                <div className="flex flex-wrap items-center gap-2">
                    <TabButton label="Modules" active={activeTab === 'modules'} onClick={() => onSelectTab('modules')} />
                    <TabButton label="Queues" active={activeTab === 'queues'} onClick={() => onSelectTab('queues')} />
                    <TabButton label="Data" active={activeTab === 'data'} onClick={() => onSelectTab('data')} />
                    <TabButton label="Events" active={activeTab === 'events'} onClick={() => onSelectTab('events')} />
                    <TabButton label="Errors" active={activeTab === 'errors'} onClick={() => onSelectTab('errors')} />
                </div>
            </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 xl:justify-end">
            <div className="font-mono text-[10px] tracking-widest text-gray-300">
                {getActiveTabCount({ activeTab, moduleCount, queueCount, dataCount, eventCount, errorCount })} {isSystemPaused ? 'PAUSED' : 'OPERATIONAL'}
            </div>
            <button
                onClick={onTogglePause}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${isSystemPaused ? 'border-amber-700/50 bg-amber-900/30 text-amber-400 hover:bg-amber-900/50' : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                style={isSystemPaused ? RESUME_ALL_STYLE : PAUSE_ALL_STYLE}
            >
                {isSystemPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                {isSystemPaused ? 'RESUME ACTIVITY' : 'PAUSE ALL'}
            </button>
        </div>
    </div>
);

function useDisplayJobs(jobs: BackgroundJob[], systemJobs: BackgroundJob[], loading?: boolean): BackgroundJob[] {
    return useMemo(() => {
        const activeJobIds = new Set(jobs.filter((job) => job.state === 'running' || job.state === 'queued').map((job) => job.id));
        const baseSystemJobs = (loading && systemJobs.length === 0) ? SKELETON_SYSTEM_JOBS : systemJobs;
        const extraJobs = jobs.filter((job) => !job.id.startsWith('system-') && activeJobIds.has(job.id) && !SYSTEM_STAGES.includes(job.stage));
        const prioritizedJobs: DashboardJobWithIndex[] = [...baseSystemJobs, ...extraJobs].map((job, index) => ({ job, index }));

        return prioritizedJobs
            .sort((left, right) => {
                const leftPriority = DASHBOARD_STATE_PRIORITY[left.job.state] ?? Number.MAX_SAFE_INTEGER;
                const rightPriority = DASHBOARD_STATE_PRIORITY[right.job.state] ?? Number.MAX_SAFE_INTEGER;
                return leftPriority === rightPriority ? left.index - right.index : leftPriority - rightPriority;
            })
            .map(({ job }) => job);
    }, [jobs, systemJobs, loading]);
}

function useDashboardErrors(activeTab: DashboardTab, onGetJobErrors: DashboardViewProps['onGetJobErrors']): DashboardErrorsState {
    const [snapshot, setSnapshot] = useState<JobErrorSnapshot | null>(null);
    const [moduleFilter, setModuleFilterState] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const loadErrors = useCallback(async (nextModuleId: string | null, nextPage: number) => {
        setLoading(true);
        try {
            const nextSnapshot = await onGetJobErrors({ moduleId: nextModuleId ?? undefined, page: nextPage, pageSize: 25 });
            setSnapshot(nextSnapshot);
        } finally {
            setLoading(false);
        }
    }, [onGetJobErrors]);

    useEffect(() => {
        if (activeTab !== 'errors') {return;}
        void loadErrors(moduleFilter, page);
        const interval = window.setInterval(() => {
            void loadErrors(moduleFilter, page);
        }, 5000);
        return () => window.clearInterval(interval);
    }, [activeTab, loadErrors, moduleFilter, page]);

    return {
        snapshot,
        loading,
        moduleFilter,
        page,
        setModuleFilter: (moduleId: string | null) => {
            setModuleFilterState(moduleId);
            setPage(1);
        },
        setPage,
        openForModule: (moduleId: string) => {
            setModuleFilterState(moduleId.startsWith('class-') ? moduleId : null);
            setPage(1);
        },
    };
}

const DashboardModulesTab: React.FC<{
    displayJobs: BackgroundJob[];
    loading?: boolean;
    onStopJob: (jobId: string) => void;
    onViewModuleErrors: (moduleId: string) => void;
    onSetModulePaused: (moduleId: string, paused: boolean) => void;
}> = ({ displayJobs, loading, onStopJob, onViewModuleErrors, onSetModulePaused }) => {
    if (displayJobs.length === 0 && !loading) {
        return <div className="flex h-full items-center justify-center bg-[#0a0a0a] text-gray-300"><p>No background jobs running or completed yet.</p></div>;
    }

    return (
        <div className="grid auto-rows-max gap-4" style={DASHBOARD_MODULE_GRID_STYLE}>
            {displayJobs.map((job) => (
                <JobCard
                    key={job.id}
                    job={job}
                    onStop={onStopJob}
                    onViewErrors={onViewModuleErrors}
                    onTogglePause={onSetModulePaused}
                />
            ))}
        </div>
    );
};

const DashboardBody: React.FC<{
    activeTab: DashboardTab;
    loading?: boolean;
    queueRows: QueueStatusSnapshot['stages'];
    queueLastUpdated?: string;
    dataStats: DataStatsSnapshot | null;
    recentEvents: RecentEventSnapshot[];
    onGetEventPayloadRaw: (eventId: string) => Promise<string>;
    displayJobs: BackgroundJob[];
    onStopJob: (jobId: string) => void;
    onViewModuleErrors: (moduleId: string) => void;
    onSetModulePaused: (moduleId: string, paused: boolean) => void;
    errorsState: DashboardErrorsState;
}> = ({ activeTab, loading, queueRows, queueLastUpdated, dataStats, recentEvents, onGetEventPayloadRaw, displayJobs, onStopJob, onViewModuleErrors, onSetModulePaused, errorsState }) => {
    if (activeTab === 'queues') {
        return (
            <>
                {queueLastUpdated && <div className="text-[10px] font-mono tracking-wider text-gray-400">UPDATED {new Date(queueLastUpdated).toLocaleTimeString()}</div>}
                <QueueStatusTable rows={queueRows} loading={loading} />
            </>
        );
    }
    if (activeTab === 'data') {return <DataStatsPanel stats={dataStats} loading={loading} />;}
    if (activeTab === 'events') {return <RecentEventsPanel events={recentEvents} loading={loading} onGetEventPayloadRaw={onGetEventPayloadRaw} />;}
    if (activeTab === 'errors') {
        return (
            <SystemErrorsPanel
                snapshot={errorsState.snapshot}
                loading={errorsState.loading}
                moduleFilter={errorsState.moduleFilter}
                onModuleFilterChange={errorsState.setModuleFilter}
                onPageChange={errorsState.setPage}
            />
        );
    }

    return (
        <DashboardModulesTab
            displayJobs={displayJobs}
            loading={loading}
            onStopJob={onStopJob}
            onViewModuleErrors={onViewModuleErrors}
            onSetModulePaused={onSetModulePaused}
        />
    );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
    jobs,
    systemJobs,
    queueStatus,
    dataStats,
    recentEvents,
    refreshSystemJobs,
    isSystemPaused,
    onTogglePause,
    onStopJob,
    onGetEventPayloadRaw,
    onGetJobErrors,
    onSetModulePaused,
    loading,
}) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('modules');
    const displayJobs = useDisplayJobs(jobs, systemJobs, loading);
    const errorsState = useDashboardErrors(activeTab, onGetJobErrors);
    const queueRows = queueStatus?.stages || [];
    const dataMetricCount = 10;
    const eventCount = recentEvents.length;
    const errorCount = displayJobs.reduce((sum, job) => sum + (job.progress.errors || 0), 0);
    const refreshIntervalMs = useMemo(
        () => displayJobs.some((job) => job.state === 'running') ? 1000 : 3000,
        [displayJobs]
    );

    useEffect(() => {
        refreshSystemJobs();
        const interval = setInterval(refreshSystemJobs, refreshIntervalMs);
        return () => clearInterval(interval);
    }, [refreshIntervalMs, refreshSystemJobs]);

    return (
        <div className="mx-auto flex h-full w-full flex-col space-y-6 overflow-y-auto bg-[#0a0a0a] p-6">
            <DashboardHeader
                loading={loading}
                isSystemPaused={isSystemPaused}
                onTogglePause={onTogglePause}
                activeTab={activeTab}
                moduleCount={displayJobs.length}
                queueCount={queueRows.length}
                dataCount={dataMetricCount}
                eventCount={eventCount}
                errorCount={errorCount}
                onSelectTab={setActiveTab}
            />

            <DashboardBody
                activeTab={activeTab}
                loading={loading}
                queueRows={queueRows}
                queueLastUpdated={queueStatus?.generatedAt}
                dataStats={dataStats}
                recentEvents={recentEvents}
                onGetEventPayloadRaw={onGetEventPayloadRaw}
                displayJobs={displayJobs}
                onStopJob={onStopJob}
                onViewModuleErrors={(moduleId) => {
                    errorsState.openForModule(moduleId);
                    setActiveTab('errors');
                }}
                onSetModulePaused={onSetModulePaused}
                errorsState={errorsState}
            />
        </div>
    );
};
