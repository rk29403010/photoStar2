import type { BackgroundJob } from "../../types/jobs";
import { ProgressBarSoft } from "./ProgressBarSoft";

export function JobRow({ job }: { job: BackgroundJob }) {
    const indeterminate = job.progress.overallPercent == null;

    return (
        <div className="border-b border-gray-200 py-3">
            <div className="flex justify-between items-center mb-1">
                <div className="font-medium">{job.title}</div>
                <div className="text-xs text-gray-500 capitalize">{job.state}</div>
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
