import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataStatsSnapshot, JobErrorSnapshot, RecentEventSnapshot, WorkflowRunListItem, WorkflowStatusSnapshot } from '@contracts/jobs';
import { DataStatsPanel } from './dashboard/DataStatsPanel';
import { RecentEventsPanel } from './dashboard/RecentEventsPanel';
import { SystemErrorsPanel } from './dashboard/SystemErrorsPanel';
import { UiFeedPanel } from './dashboard/UiFeedPanel';
import { WorkflowRunsPanel } from './dashboard/WorkflowRunsPanel';
import { WorkflowStatusPanel } from './dashboard/WorkflowStatusPanel';
import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';

interface DashboardViewProps {
    workflowStatus: WorkflowStatusSnapshot | null;
    dataStats: DataStatsSnapshot | null;
    recentEvents: RecentEventSnapshot[];
    workflowRuns: WorkflowRunListItem[];
    uiFeedEntries: UiFeedEntry[];
    refreshSystemJobs: () => void;
    onGetEventPayloadRaw: (eventId: string) => Promise<string>;
    onGetJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }) => Promise<JobErrorSnapshot>;
    loading?: boolean;
}

type DashboardTab = 'workflows' | 'data' | 'events' | 'errors' | 'ui';

type DashboardErrorsState = {
    snapshot: JobErrorSnapshot | null;
    loading: boolean;
    moduleFilter: string | null;
    page: number;
    setModuleFilter: (moduleId: string | null) => void;
    setPage: (page: number) => void;
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
    workflowCount: number;
    dataCount: number;
    eventCount: number;
    errorCount: number;
    uiCount: number;
}) {
    const { activeTab, workflowCount, dataCount, eventCount, errorCount, uiCount } = params;
    if (activeTab === 'workflows') {return `${workflowCount} WORKFLOWS`;}
    if (activeTab === 'data') {return `${dataCount} METRICS`;}
    if (activeTab === 'events') {return `${eventCount} EVENTS`;}
    if (activeTab === 'ui') {return `${uiCount} UI ENTRIES`;}
    return `${errorCount} ERRORS`;
}

const DashboardHeader: React.FC<{
    loading?: boolean;
    activeTab: DashboardTab;
    workflowCount: number;
    dataCount: number;
    eventCount: number;
    errorCount: number;
    uiCount: number;
    onSelectTab: (tab: DashboardTab) => void;
}> = ({ loading, activeTab, workflowCount, dataCount, eventCount, errorCount, uiCount, onSelectTab }) => (
    <div className="flex flex-col gap-4 border-b border-gray-800 pb-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-2xl font-light uppercase tracking-wide text-gray-100">System Dashboard</h2>
                {loading && <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] tracking-widest text-cyan-500 animate-pulse">INITIALISING DATA...</span>}
                <div className="flex flex-wrap items-center gap-2">
                    <TabButton label="Workflows" active={activeTab === 'workflows'} onClick={() => onSelectTab('workflows')} />
                    <TabButton label="Data" active={activeTab === 'data'} onClick={() => onSelectTab('data')} />
                    <TabButton label="Events" active={activeTab === 'events'} onClick={() => onSelectTab('events')} />
                    <TabButton label="UI Feed" active={activeTab === 'ui'} onClick={() => onSelectTab('ui')} />
                    <TabButton label="Errors" active={activeTab === 'errors'} onClick={() => onSelectTab('errors')} />
                </div>
            </div>
        </div>
        <div className="font-mono text-[10px] tracking-widest text-gray-300">
            {getActiveTabCount({ activeTab, workflowCount, dataCount, eventCount, errorCount, uiCount })} RUNTIME
        </div>
    </div>
);

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
        const interval = globalThis.setInterval(() => {
            void loadErrors(moduleFilter, page);
        }, 5000);
        return () => globalThis.clearInterval(interval);
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
    };
}

const DashboardBody: React.FC<{
    activeTab: DashboardTab;
    loading?: boolean;
    workflowStatus: WorkflowStatusSnapshot | null;
    dataStats: DataStatsSnapshot | null;
    recentEvents: RecentEventSnapshot[];
    workflowRuns: WorkflowRunListItem[];
    uiFeedEntries: UiFeedEntry[];
    onGetEventPayloadRaw: (eventId: string) => Promise<string>;
    errorsState: DashboardErrorsState;
}> = ({ activeTab, loading, workflowStatus, dataStats, recentEvents, workflowRuns, uiFeedEntries, onGetEventPayloadRaw, errorsState }) => {
    if (activeTab === 'workflows') {
        return (
            <div className="flex flex-col gap-4">
                <WorkflowStatusPanel snapshot={workflowStatus} loading={loading} />
                <WorkflowRunsPanel runs={workflowRuns} />
            </div>
        );
    }
    if (activeTab === 'data') {return <DataStatsPanel stats={dataStats} loading={loading} />;}
    if (activeTab === 'events') {return <RecentEventsPanel events={recentEvents} loading={loading} onGetEventPayloadRaw={onGetEventPayloadRaw} />;}
    if (activeTab === 'ui') {return <UiFeedPanel entries={uiFeedEntries} />;}
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
    return null;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
    workflowStatus,
    dataStats,
    recentEvents,
    workflowRuns,
    uiFeedEntries,
    refreshSystemJobs,
    onGetEventPayloadRaw,
    onGetJobErrors,
    loading,
}) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('workflows');
    const errorsState = useDashboardErrors(activeTab, onGetJobErrors);
    const dataMetricCount = 10;
    const eventCount = recentEvents.length;
    const errorCount = errorsState.snapshot?.total ?? 0;
    const uiCount = uiFeedEntries.length;
    const refreshIntervalMs = useMemo(
        () => workflowRuns.some((run) => run.status === 'running') ? 1000 : 3000,
        [workflowRuns]
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
                activeTab={activeTab}
                workflowCount={workflowStatus?.workflows.length ?? 0}
                dataCount={dataMetricCount}
                eventCount={eventCount}
                errorCount={errorCount}
                uiCount={uiCount}
                onSelectTab={setActiveTab}
            />

            <DashboardBody
                activeTab={activeTab}
                loading={loading}
                workflowStatus={workflowStatus}
                dataStats={dataStats}
                recentEvents={recentEvents}
                workflowRuns={workflowRuns}
                uiFeedEntries={uiFeedEntries}
                onGetEventPayloadRaw={onGetEventPayloadRaw}
                errorsState={errorsState}
            />
        </div>
    );
};
