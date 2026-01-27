import type { BackgroundJob } from "../../types/jobs";
import { JobRow } from "./JobRow";

export function TaskDrawer({ jobs }: { jobs: BackgroundJob[] }) {
    if (jobs.length === 0) return null;

    return (
        <div className="fixed bottom-0 right-0 w-96 max-h-[70vh] bg-white shadow-xl border-l border-t border-gray-200 z-50 flex flex-col">
            <div className="p-3 border-b font-semibold bg-gray-50">Background Tasks ({jobs.length})</div>
            <div className="overflow-y-auto flex-1 p-3">
                {jobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                ))}
            </div>
        </div>
    );
}
