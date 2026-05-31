import type { BackgroundJob } from '@contracts/jobs';
import { JobRow } from "./JobRow";

export function TaskDrawer({
    jobs,
    onStop,
    isMinimized,
    onMinimize,
}: {
    readonly jobs: BackgroundJob[];
    readonly onStop?: (job: BackgroundJob) => void;
    readonly isMinimized: boolean;
    readonly onMinimize: (minimized: boolean) => void;
}) {
    if (isMinimized && jobs.length === 0) {return null;}

    return (
        <div
            className="fixed bottom-8 right-3 flex max-h-[70vh] w-[26rem] flex-col overflow-hidden rounded-t-xl border border-content/10 bg-surface shadow-2xl transition-all"
            style={{ zIndex: 9995 }}
        >
            <div
                className="flex cursor-pointer select-none items-center justify-between border-b border-content/10 bg-surface-secondary/90 px-4 py-3"
                onDoubleClick={() => onMinimize(!isMinimized)}
                title="Double click to minimize"
            >
                <div>
                    <div className="text-sm font-semibold text-content">Background Tasks ({jobs.length})</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-brand-accent">Active task monitor</div>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onMinimize(true);
                    }}
                    className="rounded p-1 text-content-secondary transition-colors hover:bg-content/5 hover:text-content"
                    aria-label="Minimize tasks"
                >
                    ✕
                </button>
            </div>
            {!isMinimized && (
                <div className="flex-1 overflow-y-auto bg-surface/95 p-3">
                    {jobs.length === 0 ? (
                        <div className="p-4 text-center text-xs text-content-secondary/60">
                            No active background tasks.
                        </div>
                    ) : (
                        jobs.map((job) => (
                            <JobRow key={job.id} job={job} onStop={onStop} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
