import React, { useEffect } from 'react';
import type { BackgroundJob } from '../../shared/types/jobs';
import { AlertCircle as AlertCircleIcon, PauseCircle, PlayCircle } from 'lucide-react';

interface DashboardViewProps {
    jobs: BackgroundJob[];
    systemJobs: BackgroundJob[];
    refreshSystemJobs: () => void;
    isSystemPaused: boolean;
    onTogglePause: () => void;
    onStopJob: (jobId: string) => void;
    onClearErrors: (task: string) => void;
    loading?: boolean;
}

const SKELETON_SYSTEM_JOBS: BackgroundJob[] = [
    { id: 'class-onboarding', stage: 'onboarding', title: 'Photo Onboarding', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [], progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-previews', stage: 'previews', title: 'Thumbnail Generation', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [] , progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-detection', stage: 'analysis', title: 'Face Detection', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [] , progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-mapping', stage: 'analysis', title: 'Face Recognition', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [] , progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-clustering', stage: 'analysis', title: 'Face Clustering', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [] , progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } },
    { id: 'class-ai-metadata', stage: 'ai_metadata', title: 'AI Metadata', state: 'idle', createdAt: new Date().toISOString(), trigger: 'system', issues: [] , progress: { overallDone: 0, overallTotal: 0, overallPercent: 0, errors: 0, stages: [] } }
];

export const DashboardView: React.FC<DashboardViewProps> = ({ 
    jobs, systemJobs, refreshSystemJobs, isSystemPaused, onTogglePause, onStopJob, onClearErrors, loading 
}) => {

    useEffect(() => {
        refreshSystemJobs();
        const interval = setInterval(refreshSystemJobs, 3000);
        return () => clearInterval(interval);
    }, [refreshSystemJobs]);

    // Merge transient jobs over system jobs
    const activeJobIds = new Set(jobs.filter(j => j.state === 'running' || j.state === 'queued').map(j => j.id));

    // We only show the aggregated system jobs plus any regular jobs that don't belong to these classes
    const systemStages = ['onboarding', 'bulk_ingest', 'previews', 'preview_generation', 'analysis', 'face_analysis', 'scan', 'ai_metadata'];
    
    // If we're loading and have no system jobs yet, use skeletons to speed up the initial paint
    const baseSystemJobs = (loading && systemJobs.length === 0) ? SKELETON_SYSTEM_JOBS : systemJobs;

    const displayJobs = [
        ...baseSystemJobs,
        ...jobs.filter(j =>
            !j.id.startsWith('system-') &&
            activeJobIds.has(j.id) &&
            !systemStages.includes(j.stage)
        )
    ];

    if (displayJobs.length === 0 && !loading) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 bg-[#0a0a0a]">
                <p>No background jobs running or completed yet.</p>
            </div>
        );
    }

    return (
        <div className="p-6 w-full mx-auto overflow-y-auto h-full space-y-6 flex flex-col bg-[#0a0a0a]">
            <div className="flex justify-between items-end border-b border-gray-800 pb-3">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-light tracking-wide text-gray-100 uppercase">System Dashboard</h2>
                    {loading && (
                        <span className="text-[10px] text-cyan-500 font-mono animate-pulse tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                            INITIALISING DATA...
                        </span>
                    )}
                    <button
                        onClick={onTogglePause}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${isSystemPaused
                            ? 'bg-amber-900/30 text-amber-400 border-amber-700/50 hover:bg-amber-900/50'
                            : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:text-white'
                            }`}
                    >
                        {isSystemPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                        {isSystemPaused ? 'RESUME ACTIVITY' : 'PAUSE ALL'}
                    </button>
                </div>
                <div className="text-[10px] text-gray-500 font-mono tracking-widest">{displayJobs.length} MODULES {isSystemPaused ? 'PAUSED' : 'OPERATIONAL'}</div>
            </div>
            {/* Tighter grid for 8-10 cards without scroll */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-4 auto-rows-max">
                {displayJobs.map((job) => (
                    <JobCard key={job.id} job={job} onStop={onStopJob} onClearErrors={onClearErrors} />
                ))}
            </div>
        </div>
    );
};

const JobCard: React.FC<{ 
    job: BackgroundJob, 
    onStop: (id: string) => void, 
    onClearErrors: (task: string) => void 
}> = ({ job, onStop, onClearErrors }) => {
    const isRunning = job.state === 'running';
    const hasFailed = job.state === 'failed';
    const isComplete = job.state === 'completed';
    const isPaused = job.state === 'paused';

    const [isStopping, setIsStopping] = React.useState(false);
    const [isClearing, setIsClearing] = React.useState(false);

    React.useEffect(() => {
        if (!isRunning) setIsStopping(false);
    }, [isRunning]);

    React.useEffect(() => {
        if (!job.progress.errors) setIsClearing(false);
    }, [job.progress.errors]);

    // Premium Status Colors tailored for Dark Mode
    let stateColor = 'text-gray-400';
    let stateBg = 'bg-gray-500/10 border-gray-500/20';
    let accentColor = 'text-gray-500';

    const isIdle = job.state === 'idle';

    if (hasFailed) {
        stateColor = 'text-rose-400';
        stateBg = 'bg-rose-500/10 border-rose-500/20';
        accentColor = 'text-rose-500';
    } else if (isComplete) {
        stateColor = 'text-emerald-400';
        stateBg = 'bg-emerald-500/10 border-emerald-500/20';
        accentColor = 'text-emerald-400';
    } else if (isRunning) {
        stateColor = 'text-cyan-400';
        stateBg = 'bg-cyan-500/10 border-cyan-500/20';
        accentColor = 'text-cyan-400';
    } else if (isPaused) {
        stateColor = 'text-amber-400';
        stateBg = 'bg-amber-500/10 border-amber-500/20';
        accentColor = 'text-amber-400';
    } else if (isIdle) {
        stateColor = 'text-gray-500';
        stateBg = 'bg-gray-500/5 border-gray-800/10';
        accentColor = 'text-gray-700';
    }

    const percent = job.progress.overallPercent ?? 0;
    const isIndeterminate = job.progress.overallPercent == null && isRunning;

    return (
        <div className={`bg-[#121212] border border-[#1e1e1e] rounded-xl p-4 shadow-xl flex flex-col relative overflow-hidden transition-all duration-300 hover:border-[#333]`}>
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-medium tracking-wide text-gray-200">{job.title}</h3>
                    <p className="text-[9px] uppercase tracking-widest text-gray-500">{job.stage?.replace(/_/g, ' ') || 'UNKNOWN'}</p>
                </div>
                <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border ${stateBg} ${stateColor}`}>
                    {job.state.replace(/_/g, ' ')}
                </span>
            </div>

            {/* Main Content: Circular Progress + Graphic Equalizer */}
            <div className="flex flex-row items-center gap-6">
                {/* Circular Progress with internal count */}
                <div className="shrink-0">
                    <CircularProgress
                        percent={percent}
                        indeterminate={isIndeterminate}
                        colorClass={accentColor}
                        subLabel={(job.stage as string) === 'onboarding' ? (job.progress.overallTotal ? `${job.progress.overallTotal}` : '') : `${job.progress.overallDone || 0}`}
                    />
                </div>

                {/* Equalizer / Graphic Area */}
                <div className="flex-1 flex flex-col justify-center h-24 border-l border-gray-800/50 pl-6">
                    <Equalizer
                        activeCount={job.activeCount || 0}
                        throughput={job.progress.throughputIps || 0}
                        isRunning={isRunning}
                        colorClass={accentColor}
                    />

                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-widest text-gray-600">Errors</span>
                            <span className={`text-xs font-mono ${job.progress.errors ? 'text-rose-500' : 'text-gray-400'}`}>
                                {job.progress.errors || 0}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-widest text-gray-600">
                                {job.avgDurationSec !== undefined ? "Avg Speed" : "Runtime"}
                            </span>
                            <span className="text-xs font-mono text-gray-400">
                                {job.avgDurationSec !== undefined
                                    ? (job.avgDurationSec < 60 ? `${Math.round(job.avgDurationSec)}s` : `${Math.round(job.avgDurationSec / 60)}m`)
                                    : (job.startedAt ? getRuntimeString(job.startedAt, job.finishedAt) : '--')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Issues List */}
            {job.issues && job.issues.length > 0 && (
                <div className="mt-6 pt-4 border-t border-rose-950/30">
                    <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-widest text-rose-400 font-bold">
                        <AlertCircleIcon size={12} />
                        Recent Issues
                    </div>
                    <div className="space-y-1.5">
                        {job.issues.slice(0, 3).map((issue) => (
                            <div key={issue.id} className="text-[11px] text-gray-400 bg-rose-950/10 px-2 py-1.5 rounded-md border border-rose-900/10 flex gap-2">
                                <span className="text-rose-500 font-bold">•</span>
                                <span className="truncate">{issue.message}</span>
                            </div>
                        ))}
                        {job.issues.length > 3 && (
                            <div className="text-[10px] text-gray-500 italic pl-2">
                                + {job.issues.length - 3} more issues
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Actions Footer - More compact and svelte */}
            <div className="mt-auto pt-3 flex justify-between items-center px-4 py-2 bg-black/40 -mx-4 -mb-4 border-t border-gray-800/30">
                <div className="flex gap-1.5">
                    {isRunning && (
                        <button
                            disabled={isStopping}
                            onClick={(e) => { e.stopPropagation(); setIsStopping(true); onStop(job.id); }}
                            className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tighter rounded border transition-colors cursor-pointer ${
                                isStopping 
                                ? 'bg-rose-900/10 text-rose-800 border-rose-900/20 cursor-wait'
                                : 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20'
                            }`}
                        >
                            {isStopping ? 'Stopping...' : 'Stop'}
                        </button>
                    )}
                    {(job.progress.errors || 0) > 0 && (
                        <button
                            disabled={isClearing}
                            onClick={(e) => { e.stopPropagation(); setIsClearing(true); onClearErrors(job.id.startsWith('class-') ? job.id : job.stage); }}
                            className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tighter rounded border transition-colors cursor-pointer ${
                                isClearing
                                ? 'bg-gray-800/20 text-gray-600 border-gray-800/20 cursor-wait'
                                : 'bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20'
                            }`}
                        >
                            {isClearing ? 'Clearing...' : 'Clear'}
                        </button>
                    )}
                </div>
                <div className="text-[8px] text-gray-600 font-mono tracking-tight opacity-50 uppercase">
                    {job.id.startsWith('class-') ? 'Persistent' : 'Ephemeral'}
                </div>
            </div>

            {/* Animated Glow when running */}
            {isRunning && !isStopping && (
                <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-cyan-500/80 to-transparent animate-[pulse_2s_ease-in-out_infinite]" />
            )}
        </div>
    );
}

// Subcomponents

const CircularProgress: React.FC<{ percent: number, indeterminate?: boolean, colorClass?: string, subLabel?: string }> = ({ percent, indeterminate, colorClass = "text-cyan-400", subLabel }) => {
    const radius = 60; // Increased size
    const stroke = 6;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = Math.max(0, circumference - (percent / 100) * circumference);

    return (
        <div className="relative flex items-center justify-center pointer-events-none">
            <svg
                height={radius * 2}
                width={radius * 2}
                className={indeterminate ? "animate-spin" : "transition-all duration-600 ease-out"}
                style={{ transform: indeterminate ? 'none' : 'rotate(-90deg)' }}
            >
                <circle
                    stroke="currentColor"
                    fill="transparent"
                    strokeWidth={stroke}
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                    className="text-gray-900"
                />
                {!indeterminate && (
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset }}
                        strokeLinecap="round"
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        className={`${colorClass} transition-all duration-600 ease-out`}
                    />
                )}
                {indeterminate && (
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference * 0.25 + ' ' + circumference}
                        strokeLinecap="round"
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        className={`${colorClass}`}
                    />
                )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {!indeterminate ? (
                    <div className="flex flex-col items-center leading-none">
                        <span className={`text-2xl font-bold tracking-tight ${percent === 100 ? 'text-emerald-400' : 'text-gray-100'}`}>
                            {Math.round(percent)}
                            <span className="text-[10px] opacity-40 ml-0.5">%</span>
                        </span>
                        {subLabel && (
                            <span className="text-[10px] text-gray-500 font-mono mt-0.5 lowercase tracking-tighter">
                                {subLabel} items
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce"></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const Equalizer: React.FC<{ activeCount: number, throughput: number, isRunning: boolean, colorClass: string }> = ({ activeCount, throughput, isRunning, colorClass }) => {
    // Determine bar count. If not running, maybe 0.
    const barCount = isRunning ? Math.max(0, activeCount) : 0;
    const bars = Array.from({ length: 8 }); // Always show 8 slots for stability

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-end gap-1 h-10 w-32">
                {bars.map((_, i) => {
                    const isActive = i < barCount;
                    // Vary duration based on index to avoid uniform movement
                    const duration = 0.5 + (i * 0.15) % 0.8;
                    return (
                        <div
                            key={i}
                            className={`w-2 transition-all rounded-t-sm ${isActive ? colorClass : 'bg-gray-800/20'}`}
                            style={{
                                height: isActive ? '100%' : '15%',
                                animation: isActive ? `eq-pulse ${duration}s infinite ease-in-out alternate` : 'none',
                                animationDelay: `${i * 0.1}s`,
                                opacity: isActive ? 0.8 : 0.3
                            }}
                        />
                    );
                })}
            </div>
            <div className="flex justify-between items-center w-32">
                <span className="text-[8px] uppercase tracking-widest text-gray-700 font-bold">Throughput</span>
                <span className="text-[10px] font-mono text-cyan-400/80">
                    {throughput > 0 ? `${throughput.toFixed(1)} it/s` : 'IDLE'}
                </span>
            </div>
        </div>
    );
};

function getRuntimeString(startStr: string, endStr?: string) {
    try {
        const start = new Date(startStr).getTime();
        const end = endStr ? new Date(endStr).getTime() : Date.now();
        const diffSecs = Math.max(0, Math.floor((end - start) / 1000));

        if (diffSecs < 60) return `${diffSecs}s`;
        const mins = Math.floor(diffSecs / 60);
        const secs = diffSecs % 60;
        if (mins < 60) return `${mins}m ${secs}s`;
        const hours = Math.floor(mins / 60);
        const rmins = mins % 60;
        return `${hours}h ${rmins}m`;
    } catch {
        return '--';
    }
}
