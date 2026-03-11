import type { BackgroundJob } from '@contracts/jobs';
import { JobRow } from "./JobRow";

export function TaskDrawer({
    jobs,
    onStop,
    isMinimized,
    onMinimize,
}: {
    jobs: BackgroundJob[];
    onStop?: (job: BackgroundJob) => void;
    isMinimized: boolean;
    onMinimize: (minimized: boolean) => void;
}) {
    if (jobs.length === 0) {return null;}

    return (
        <div className="fixed bottom-8 right-3 z-50 flex max-h-[70vh] w-[26rem] flex-col overflow-hidden rounded-t-xl border border-slate-800 bg-[#0f172a] shadow-2xl shadow-black/40 transition-all">
            <div
                className="flex cursor-pointer select-none items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3"
                onDoubleClick={() => onMinimize(!isMinimized)}
                title="Double click to minimize"
            >
                <div>
                    <div className="text-sm font-semibold text-slate-100">Background Tasks ({jobs.length})</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Active task monitor</div>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onMinimize(true);
                    }}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                    aria-label="Minimize tasks"
                >
                    ✕
                </button>
            </div>
            {!isMinimized && (
                <div className="flex-1 overflow-y-auto bg-slate-900/95 p-3">
                    {jobs.map((job) => (
                        <JobRow key={job.id} job={job} onStop={onStop} />
                    ))}
                </div>
            )}
        </div>
    );
}
