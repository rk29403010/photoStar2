import { useState, useCallback } from 'react';
import type { BackgroundJob, JobKind, JobState } from '../types/jobs';

export function useJobManager() {
    const [jobs, setJobs] = useState<BackgroundJob[]>([]);

    const addJob = useCallback((id: string, kind: JobKind, title: string) => {
        const newJob: BackgroundJob = {
            id,
            kind,
            title,
            state: 'queued',
            createdAt: new Date().toISOString(),
            trigger: 'user',
            progress: {
                stages: [],
                overallPercent: undefined // indeterminate start
            },
            issues: []
        };

        setJobs(prev => [newJob, ...prev]);
    }, []);

    const updateJobState = useCallback((id: string, state: JobState) => {
        setJobs(prev => prev.map(job => {
            if (job.id !== id) return job;
            return {
                ...job,
                state,
                startedAt: state === 'running' && !job.startedAt ? new Date().toISOString() : job.startedAt,
                finishedAt: (state === 'completed' || state === 'failed') ? new Date().toISOString() : undefined
            };
        }));
    }, []);

    const updateJobProgress = useCallback((id: string, payload: any) => {
        setJobs(prev => prev.map(job => {
            if (job.id !== id) return job;

            // Map backend payload to JobProgress
            // Backend sends: { status: 'running'|'complete', processed, total, current, message? }

            const newProgress = { ...job.progress };

            if (payload.processed !== undefined) {
                newProgress.overallDone = payload.processed;
            }
            if (payload.total !== undefined) {
                newProgress.overallTotal = payload.total;
            }

            if (newProgress.overallTotal && newProgress.overallTotal > 0) {
                newProgress.overallPercent = (newProgress.overallDone || 0) / newProgress.overallTotal * 100;
            } else if (payload.status === 'complete') {
                newProgress.overallPercent = 100;
            }

            // Map specific stats if available (based on job kind)
            if (job.kind === 'face_analysis') {
                if (payload.message && payload.message.includes('Detecting')) {
                    // Maybe parse? For now just use message
                }
            }

            // Pass through message and current file
            newProgress.message = payload.message;
            newProgress.current = payload.current;

            let state = job.state;
            if (payload.status === 'running') state = 'running';
            if (payload.status === 'complete') state = 'completed';
            if (payload.status === 'error') state = 'failed';

            return {
                ...job,
                state,
                progress: newProgress,
                finishedAt: state === 'completed' ? new Date().toISOString() : undefined
            };
        }));
    }, []);

    return {
        jobs,
        addJob,
        updateJobState,
        updateJobProgress
    };
}
