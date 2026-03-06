import React, { useState } from 'react';
import type { BackgroundJob } from '../../../shared/types/jobs';
import { ProgressBarSoft } from "./ProgressBarSoft";

export function JobRow({ job, onStop }: { job: BackgroundJob, onStop?: (id: string) => void }) {
    const indeterminate = job.progress.overallPercent == null;
    const [isStopping, setIsStopping] = useState(false);

    // Reset when job changes state
    React.useEffect(() => {
        if (job.state !== 'running') setIsStopping(false);
    }, [job.state]);

    return (
        <div className="border-b border-gray-200 py-3">
            <div className="flex justify-between items-center mb-1">
                <div className="font-medium">{job.title}</div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500 capitalize">{job.state}</div>
                    {job.state === 'running' && onStop && (
                        <button 
                            disabled={isStopping}
                            onClick={() => { setIsStopping(true); onStop(job.id); }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                                isStopping 
                                ? 'bg-rose-100 text-rose-400 cursor-wait'
                                : 'bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer'
                            }`}
                        >
                            {isStopping ? 'Stopping...' : 'Stop'}
                        </button>
                    )}
                </div>
            </div>

            <ProgressBarSoft
                indeterminate={indeterminate}
                percent={job.progress.overallPercent}
            />

            <div className="text-xs text-gray-600 mt-1 flex gap-3">
                {job.progress.indexed != null && <span>{job.progress.indexed} indexed</span>}
                {/* {job.progress.analysed != null && <span>{job.progress.analysed} analysed</span>} */}
                {job.progress.facesRecognised != null && (
                    <span>{job.progress.facesRecognised} faces</span>
                )}
                {job.progress.warnings ? <span>{job.progress.warnings} warnings</span> : null}

                {/* Show backend message if available and no specific stats */}
                {job.progress.message && !job.progress.facesRecognised && (
                    <span>{job.progress.message}</span>
                )}
                {job.progress.current && (
                    <span className="truncate max-w-[150px]" title={job.progress.current}>{job.progress.current}</span>
                )}
            </div>
        </div>
    );
}
