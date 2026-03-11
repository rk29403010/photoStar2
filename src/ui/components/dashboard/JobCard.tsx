import React from 'react';
import type { BackgroundJob } from '@contracts/jobs';

type StatusVisuals = { stateColor: string; stateBg: string; accentColor: string };
type EqualizerBarStyle = React.CSSProperties & {
    animationName: string;
    animationDuration: string;
    animationIterationCount: 'infinite' | '1';
    animationTimingFunction: string;
    animationDirection: 'alternate' | 'normal';
    animationDelay: string;
};
type CurrentItemDetails = { displayName: string; fullPath: string };

function getRuntimeString(startStr: string, endStr?: string) {
    try {
        const start = new Date(startStr).getTime();
        const end = endStr ? new Date(endStr).getTime() : Date.now();
        const diffSecs = Math.max(0, Math.floor((end - start) / 1000));
        if (diffSecs < 60) {return `${diffSecs}s`;}
        const mins = Math.floor(diffSecs / 60);
        const secs = diffSecs % 60;
        if (mins < 60) {return `${mins}m ${secs}s`;}
        const hours = Math.floor(mins / 60);
        const rmins = mins % 60;
        return `${hours}h ${rmins}m`;
    } catch {
        return '--';
    }
}

function getStatusVisuals(state: BackgroundJob['state']): StatusVisuals {
    const map: Record<string, StatusVisuals> = {
        failed: { stateColor: 'text-rose-400', stateBg: 'bg-rose-500/10 border-rose-500/20', accentColor: 'text-rose-500' },
        completed: { stateColor: 'text-emerald-400', stateBg: 'bg-emerald-500/10 border-emerald-500/20', accentColor: 'text-emerald-400' },
        running: { stateColor: 'text-cyan-400', stateBg: 'bg-cyan-500/10 border-cyan-500/20', accentColor: 'text-cyan-400' },
        paused: { stateColor: 'text-amber-400', stateBg: 'bg-amber-500/10 border-amber-500/20', accentColor: 'text-amber-400' },
        idle: { stateColor: 'text-gray-300', stateBg: 'bg-gray-500/5 border-gray-800/40', accentColor: 'text-gray-300' },
    };
    return map[state] || { stateColor: 'text-gray-300', stateBg: 'bg-gray-500/5 border-gray-800/10', accentColor: 'text-gray-300' };
}

function getCurrentItemDetails(currentItemPath?: string): CurrentItemDetails | null {
    const fullPath = currentItemPath?.trim();
    if (!fullPath) {return null;}

    const segments = fullPath.split(/[/\\]/).filter(Boolean);
    return {
        displayName: segments[segments.length - 1] || fullPath,
        fullPath,
    };
}

const CircularProgress: React.FC<{ percent: number; indeterminate?: boolean; colorClass?: string; subLabel?: string }> = ({ percent, indeterminate, colorClass = 'text-cyan-400', subLabel }) => {
    const radius = 60;
    const stroke = 6;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = Math.max(0, circumference - (percent / 100) * circumference);
    return (
        <div className="relative flex items-center justify-center pointer-events-none">
            <svg height={radius * 2} width={radius * 2} className={indeterminate ? 'animate-spin' : 'transition-all duration-600 ease-out'} style={{ transform: indeterminate ? 'none' : 'rotate(-90deg)' }}>
                <circle stroke="currentColor" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} className="text-gray-900" />
                {!indeterminate && <circle stroke="currentColor" fill="transparent" strokeWidth={stroke} strokeDasharray={circumference + ' ' + circumference} style={{ strokeDashoffset }} strokeLinecap="round" r={normalizedRadius} cx={radius} cy={radius} className={`${colorClass} transition-all duration-600 ease-out`} />}
                {indeterminate && <circle stroke="currentColor" fill="transparent" strokeWidth={stroke} strokeDasharray={circumference * 0.25 + ' ' + circumference} strokeLinecap="round" r={normalizedRadius} cx={radius} cy={radius} className={colorClass} />}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {!indeterminate ? (
                    <div className="flex flex-col items-center leading-none">
                        <span className={`text-2xl font-bold tracking-tight ${percent === 100 ? 'text-emerald-400' : 'text-gray-100'}`}>{Math.round(percent)}<span className="ml-0.5 text-[10px] opacity-40">%</span></span>
                        {subLabel && <span className="mt-0.5 text-[10px] font-mono lowercase tracking-tighter text-gray-300">{subLabel} items</span>}
                    </div>
                ) : (
                    <div className="flex gap-1">
                        <div className="h-1 w-1 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.3s]" />
                        <div className="h-1 w-1 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.15s]" />
                        <div className="h-1 w-1 animate-bounce rounded-full bg-cyan-400" />
                    </div>
                )}
            </div>
        </div>
    );
};

function getEqualizerBarClass(isActive: boolean, colorClass: string): string {
    return `w-2 transition-all rounded-t-sm ${isActive ? colorClass : 'bg-gray-800/20'}`;
}

function getEqualizerBarStyle(isActive: boolean, index: number): EqualizerBarStyle {
    const duration = 0.5 + (index * 0.15) % 0.8;
    return {
        height: isActive ? '100%' : '15%',
        animationName: isActive ? 'eq-pulse' : 'none',
        animationDuration: `${duration}s`,
        animationIterationCount: 'infinite',
        animationTimingFunction: 'ease-in-out',
        animationDirection: 'alternate',
        animationDelay: `${index * 0.1}s`,
        opacity: isActive ? 0.8 : 0.3,
    };
}

function getJobSubLabel(job: BackgroundJob): string {
    if (job.stage === 'onboarding') {
        if (!job.progress.overallTotal) {return '';}
        return `${job.progress.overallTotal}`;
    }
    return `${job.progress.overallDone || 0}`;
}

function getJobRuntime(job: BackgroundJob): string {
    if (job.avgDurationSec !== undefined) {
        if (job.avgDurationSec < 60) {return `${Math.round(job.avgDurationSec)}s`;}
        return `${Math.round(job.avgDurationSec / 60)}m`;
    }
    if (!job.startedAt) {return '--';}
    return getRuntimeString(job.startedAt, job.finishedAt);
}

function getRuntimeLabel(job: BackgroundJob): string {
    return job.avgDurationSec !== undefined ? 'Avg Speed' : 'Runtime';
}

function getStateButtonClasses(visuals: StatusVisuals, isInteractive: boolean): string {
    return `rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${visuals.stateBg} ${visuals.stateColor} ${isInteractive ? 'transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/50' : 'cursor-default'}`;
}

const EqualizerBar: React.FC<{ index: number; isActive: boolean; colorClass: string }> = ({ index, isActive, colorClass }) => (
    <div className={getEqualizerBarClass(isActive, colorClass)} style={getEqualizerBarStyle(isActive, index)} />
);

const Equalizer: React.FC<{ activeCount: number; throughput: number; isRunning: boolean; colorClass: string }> = ({ activeCount, throughput, isRunning, colorClass }) => {
    const barCount = isRunning ? Math.max(0, activeCount) : 0;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex h-10 w-32 items-end gap-1">
                {Array.from({ length: 8 }).map((_, i) => <EqualizerBar key={i} index={i} isActive={i < barCount} colorClass={colorClass} />)}
            </div>
            <div className="flex w-32 items-center justify-between">
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-300">Throughput</span>
                <span className="text-[10px] font-mono text-cyan-400/80">{throughput > 0 ? `${throughput.toFixed(1)} it/s` : 'IDLE'}</span>
            </div>
        </div>
    );
};

const JobHeader: React.FC<{
    job: BackgroundJob;
    visuals: StatusVisuals;
    isStatusInteractive: boolean;
    isTogglingPause: boolean;
    onTogglePause?: () => void;
}> = ({ job, visuals, isStatusInteractive, isTogglingPause, onTogglePause }) => (
    <div className="mb-4 flex items-start justify-between gap-4">
        <div>
            <h3 className="text-lg font-medium tracking-wide text-gray-200">{job.title}</h3>
            <p className="text-[9px] uppercase tracking-widest text-gray-300">{job.stage?.replace(/_/g, ' ') || 'UNKNOWN'}</p>
        </div>
        {isStatusInteractive ? (
            <button type="button" onClick={onTogglePause} disabled={isTogglingPause} className={getStateButtonClasses(visuals, true)}>
                {isTogglingPause ? 'Saving...' : job.state.replace(/_/g, ' ')}
            </button>
        ) : (
            <span className={getStateButtonClasses(visuals, false)}>{job.state.replace(/_/g, ' ')}</span>
        )}
    </div>
);

const JobMetrics: React.FC<{
    job: BackgroundJob;
    isRunning: boolean;
    accentColor: string;
    onViewErrors: () => void;
}> = ({ job, isRunning, accentColor, onViewErrors }) => {
    const percent = job.progress.overallPercent ?? 0;
    const isIndeterminate = job.progress.overallPercent == null && isRunning;
    const subLabel = getJobSubLabel(job);
    const runtime = getJobRuntime(job);
    const runtimeLabel = getRuntimeLabel(job);
    const errorCount = job.progress.errors || 0;
    const throughput = job.progress.throughputIps || 0;
    const activeCount = job.activeCount || 0;

    return (
        <div className="flex flex-row items-center gap-6">
            <div className="shrink-0">
                <CircularProgress percent={percent} indeterminate={isIndeterminate} colorClass={accentColor} subLabel={subLabel} />
            </div>
            <div className="flex h-24 flex-1 flex-col justify-center border-l border-gray-800/50 pl-6">
                <Equalizer activeCount={activeCount} throughput={throughput} isRunning={isRunning} colorClass={accentColor} />
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <button type="button" onClick={onViewErrors} className="flex flex-col items-start rounded-md px-1 py-1 text-left transition-colors hover:bg-rose-950/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/40">
                        <span className="text-[9px] uppercase tracking-widest text-gray-300">Errors</span>
                        <span className={`text-xs font-mono ${errorCount > 0 ? 'text-rose-500' : 'text-gray-400'}`}>{errorCount}</span>
                        <span className="text-[8px] uppercase tracking-widest text-gray-500">Open errors tab</span>
                    </button>
                    <div className="flex flex-col px-1 py-1">
                        <span className="text-[9px] uppercase tracking-widest text-gray-300">{runtimeLabel}</span>
                        <span className="text-xs font-mono text-gray-400">{runtime}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const JobCurrentItem: React.FC<{ currentItemPath?: string; isRunning: boolean; accentColor: string }> = ({ currentItemPath, isRunning, accentColor }) => {
    const currentItem = getCurrentItemDetails(currentItemPath);
    if (!isRunning || !currentItem) {return null;}

    return (
        <div className="mt-4 rounded-lg border border-gray-800/60 bg-black/30 px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-gray-400">Current Item</div>
            <div className="mt-1 flex min-w-0 items-start gap-2" title={currentItem.fullPath}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full bg-current animate-pulse ${accentColor}`} />
                <div className="min-w-0">
                    <div className="truncate text-[11px] font-mono text-gray-100">{currentItem.displayName}</div>
                    {currentItem.displayName !== currentItem.fullPath && (
                        <div className="truncate text-[9px] font-mono text-gray-500">{currentItem.fullPath}</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const JobFooter: React.FC<{ isClassJob: boolean }> = ({ isClassJob }) => (
    <div className="mt-auto border-t border-gray-800/30 bg-black/40 px-4 py-2 text-right text-[8px] font-mono uppercase tracking-tight text-gray-300 opacity-70 -mx-4 -mb-4 pt-3">
        {isClassJob ? 'Persistent' : 'Ephemeral'}
    </div>
);

export const JobCard: React.FC<{
    job: BackgroundJob;
    onStop: (id: string) => void;
    onViewErrors: (moduleId: string) => void;
    onTogglePause: (moduleId: string, paused: boolean) => void;
}> = ({ job, onViewErrors, onTogglePause }) => {
    const isRunning = job.state === 'running';
    const isPaused = job.state === 'paused';
    const isClassJob = job.id.startsWith('class-');
    const [isTogglingPause, setIsTogglingPause] = React.useState(false);
    const visuals = getStatusVisuals(job.state);
    const isStatusInteractive = Boolean(job.canPause) && isClassJob && (isRunning || isPaused);

    React.useEffect(() => {
        setIsTogglingPause(false);
    }, [job.state]);

    const handleTogglePause = () => {
        if (!isStatusInteractive) {return;}
        setIsTogglingPause(true);
        onTogglePause(job.id, !isPaused);
    };

    return (
        <div className="relative flex flex-col overflow-hidden rounded-xl border border-[#1e1e1e] bg-[#121212] p-4 shadow-xl transition-all duration-300 hover:border-[#333]">
            <JobHeader
                job={job}
                visuals={visuals}
                isStatusInteractive={isStatusInteractive}
                isTogglingPause={isTogglingPause}
                onTogglePause={handleTogglePause}
            />
            <JobMetrics
                job={job}
                isRunning={isRunning}
                accentColor={visuals.accentColor}
                onViewErrors={() => onViewErrors(job.id)}
            />
            <JobCurrentItem currentItemPath={job.progress.current} isRunning={isRunning} accentColor={visuals.accentColor} />
            <JobFooter isClassJob={isClassJob} />
            {isRunning && !isTogglingPause && <div className="absolute left-0 top-0 h-px w-full animate-[pulse_2s_ease-in-out_infinite] bg-linear-to-r from-transparent via-cyan-500/80 to-transparent" />}
        </div>
    );
};
