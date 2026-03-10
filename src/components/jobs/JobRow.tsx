import React, { useState } from 'react';
import type { BackgroundJob } from '../../../shared/types/jobs';
import { ProgressBarSoft } from "./ProgressBarSoft";

function StopJobButton({
    actionLabel,
    isStopping,
    onStop
}: {
    actionLabel: string | null;
    isStopping: boolean;
    onStop: () => void;
}) {
    if (!actionLabel) {
        return null;
    }

    const isRemoveAction = actionLabel === 'Remove';
    return (
        <button
            disabled={isStopping}
            onClick={onStop}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                isStopping
                    ? 'bg-rose-950/40 text-rose-300 cursor-wait'
                    : isRemoveAction
                        ? 'bg-amber-900/40 text-amber-100 hover:bg-amber-900/60 cursor-pointer'
                        : 'bg-rose-900/40 text-rose-100 hover:bg-rose-900/60 cursor-pointer'
            }`}
        >
            {isStopping ? `${actionLabel}...` : actionLabel}
        </button>
    );
}

function JobProgressStats({ job }: { job: BackgroundJob }) {
    const { current, facesRecognised, indexed, message, warnings } = job.progress;

    return (
        <div className="mt-1 flex gap-3 text-xs text-slate-300">
            {indexed != null && <span>{indexed} indexed</span>}
            {facesRecognised != null && <span>{facesRecognised} faces</span>}
            {warnings ? <span>{warnings} warnings</span> : null}
            {message && !facesRecognised && <span>{message}</span>}
            {current && <span className="truncate max-w-[150px]" title={current}>{current}</span>}
        </div>
    );
}

export function JobRow({ job, onStop }: { job: BackgroundJob, onStop?: (job: BackgroundJob) => void }) {
    const indeterminate = job.progress.overallPercent == null;
    const [isStopping, setIsStopping] = useState(false);
    const actionLabel = typeof onStop !== 'function'
        ? null
        : job.state === 'running'
            ? 'Stop'
            : job.state === 'queued'
                ? 'Remove'
                : null;

    // Reset when job changes state
    React.useEffect(() => {
        if (job.state !== 'running' && job.state !== 'queued') {setIsStopping(false);}
    }, [job.state]);

    const handleStop = () => {
        if (!onStop) {
            return;
        }

        setIsStopping(true);
        onStop(job);
    };

    return (
        <div className="border-b border-slate-800 py-3">
            <div className="flex justify-between items-center mb-1">
                <div className="font-medium text-slate-100">{job.title}</div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-300 capitalize">{job.state}</div>
                    <StopJobButton actionLabel={actionLabel} isStopping={isStopping} onStop={handleStop} />
                </div>
            </div>

            <ProgressBarSoft
                indeterminate={indeterminate}
                percent={job.progress.overallPercent}
            />

            <div className="text-slate-300">
                <JobProgressStats job={job} />
            </div>
        </div>
    );
}
