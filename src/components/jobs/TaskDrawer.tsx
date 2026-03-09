import { useState } from "react";
import type { BackgroundJob } from '../../../shared/types/jobs';
import { JobRow } from "./JobRow";

export function TaskDrawer({ jobs, onStop }: { jobs: BackgroundJob[], onStop?: (id: string) => void }) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [isClosed, setIsClosed] = useState(false);

    if (jobs.length === 0 || isClosed) {return null;}

    return (
        <div className="fixed bottom-0 right-0 w-96 max-h-[70vh] bg-white shadow-xl border-l border-t border-gray-200 z-50 flex flex-col transition-all">
            <div
                className="p-3 border-b font-semibold bg-gray-50 cursor-pointer select-none flex justify-between items-center"
                onDoubleClick={() => setIsMinimized(!isMinimized)}
                title="Double click to minimize"
            >
                <span>Background Tasks ({jobs.length})</span>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsClosed(true);
                    }}
                    className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 transition-colors"
                >
                    ✕
                </button>
            </div>
            {!isMinimized && (
                <div className="overflow-y-auto flex-1 p-3">
                    {jobs.map((job) => (
                        <JobRow key={job.id} job={job} onStop={onStop} />
                    ))}
                </div>
            )}
        </div>
    );
}
