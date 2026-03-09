import React, { useState } from 'react';
import type { BackgroundJob } from '../../../shared/types/jobs';
import { ProgressBarSoft } from "./ProgressBarSoft";

function StopJobButton({
    canStop,
    isStopping,
    onStop
}: {
    canStop: boolean;
    isStopping: boolean;
    onStop: () => void;
}) {
    if (!canStop) {
        return null;
    }

    return (
        <button
            disabled={isStopping}
            onClick={onStop}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                isStopping
                    ? 'bg-rose-100 text-rose-400 cursor-wait'
                    : 'bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer'
            }`}
        >
            {isStopping ? 'Stopping...' : 'Stop'}
        </button>
    );
}

function JobProgressStats({ job }: { job: BackgroundJob }) {
    const { current, facesRecognised, indexed, message, warnings } = job.progress;

    return (
        <div className="text-xs text-gray-600 mt-1 flex gap-3">
            {indexed != null && <span>{indexed} indexed</span>}
            {facesRecognised != null && <span>{facesRecognised} faces</span>}
            {warnings ? <span>{warnings} warnings</span> : null}
            {message && !facesRecognised && <span>{message}</span>}
            {current && <span className="truncate max-w-[150px]" title={current}>{current}</span>}
        </div>
    );
}

export function JobRow({ job, onStop }: { job: BackgroundJob, onStop?: (id: string) => void }) {
    const indeterminate = job.progress.overallPercent == null;
    const [isStopping, setIsStopping] = useState(false);
    const canStop = job.state === 'running' && typeof onStop === 'function';

    // Reset when job changes state
    React.useEffect(() => {
        if (job.state !== 'running') {setIsStopping(false);}
    }, [job.state]);

    const handleStop = () => {
        if (!onStop) {
            return;
        }

        setIsStopping(true);
        onStop(job.id);
    };

    return (
        <div className="border-b border-gray-200 py-3">
            <div className="flex justify-between items-center mb-1">
                <div className="font-medium">{job.title}</div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500 capitalize">{job.state}</div>
                    <StopJobButton canStop={canStop} isStopping={isStopping} onStop={handleStop} />
                </div>
            </div>

            <ProgressBarSoft
                indeterminate={indeterminate}
                percent={job.progress.overallPercent}
            />

            <JobProgressStats job={job} />
        </div>
    );
}
