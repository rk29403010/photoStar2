import React, { useState } from 'react';
import type { BackgroundJob } from '@contracts/jobs';
import { ProgressBarSoft } from "./ProgressBarSoft";

function getRunningStage(job: BackgroundJob) {
    return job.progress.stages.find((stage) => stage.state === 'running')
        ?? job.progress.stages.find((stage) => stage.state === 'failed');
}

function toStagePercent(stage: BackgroundJob['progress']['stages'][number] | undefined) {
    if (!stage?.total || stage.total <= 0) {
        return undefined;
    }
    return ((stage.done ?? 0) / stage.total) * 100;
}

function getActionLabel(job: BackgroundJob, onStop?: (job: BackgroundJob) => void) {
    if (typeof onStop !== 'function') {
        return null;
    }
    if (job.state === 'running') {
        return 'Stop';
    }
    if (job.state === 'queued') {
        return 'Remove';
    }
    return null;
}

function StopJobButton({
    actionLabel,
    isStopping,
    onStop
}: {
    readonly actionLabel: string | null;
    readonly isStopping: boolean;
    readonly onStop: () => void;
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
                (function () {
                    if (isStopping) {return 'bg-rose-950/40 text-rose-300 cursor-wait';}
                    if (isRemoveAction) {return 'bg-amber-900/40 text-amber-100 hover:bg-amber-900/60 cursor-pointer';}
                    return 'bg-rose-900/40 text-rose-100 hover:bg-rose-900/60 cursor-pointer';
                }())
            }`}
        >
            {isStopping ? `${actionLabel}...` : actionLabel}
        </button>
    );
}

function JobProgressStats({ job }: { readonly job: BackgroundJob }) {
    const { current, facesRecognised, indexed, message, warnings } = job.progress;

    return (
        <div className="mt-1 flex gap-3 text-xs text-content-secondary">
            {indexed != null && <span>{indexed} indexed</span>}
            {facesRecognised != null && <span>{facesRecognised} faces</span>}
            {warnings ? <span>{warnings} warnings</span> : null}
            {message && !facesRecognised && <span>{message}</span>}
            {current && <span className="truncate max-w-[150px]" title={current}>{current}</span>}
        </div>
    );
}

export function JobRow({ job, onStop }: { readonly job: BackgroundJob, readonly onStop?: (job: BackgroundJob) => void }) {
    const indeterminate = job.progress.overallPercent == null;
    const runningStage = getRunningStage(job);
    const stagePercent = toStagePercent(runningStage);
    const [isStopping, setIsStopping] = useState(false);
    const actionLabel = getActionLabel(job, onStop);

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
        <div className="border-b border-content/10 py-3">
            <div className="flex justify-between items-center mb-1">
                <div className="font-medium text-content">{job.title}</div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-content-secondary capitalize">{job.state}</div>
                    <StopJobButton actionLabel={actionLabel} isStopping={isStopping} onStop={handleStop} />
                </div>
            </div>

            <ProgressBarSoft
                indeterminate={indeterminate}
                percent={job.progress.overallPercent}
            />
            {runningStage ? (
                <div className="mt-1">
                    <ProgressBarSoft
                        indeterminate={stagePercent == null}
                        percent={stagePercent}
                    />
                    <div className="mt-1 text-[10px] text-content-secondary/80">
                        {runningStage.label}: {runningStage.done ?? 0}/{runningStage.total ?? 0}
                    </div>
                </div>
            ) : null}

            <div className="text-content-secondary">
                <JobProgressStats job={job} />
            </div>
        </div>
    );
}
