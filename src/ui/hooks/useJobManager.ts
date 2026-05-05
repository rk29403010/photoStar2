import { useState, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BackgroundJob, PipelineStage, JobState } from '@contracts/jobs';
import type { DomainEvent } from '@contracts/events';

const TERMINAL_STATES = new Set<JobState>(['completed', 'failed', 'cancelled']);
const MAX_TERMINAL_JOB_HISTORY = 40;
const JOB_TITLE_BY_STAGE: Record<string, string> = {
    'bulk_ingest': 'Ingesting Library',
    'scan': 'Scanning Folders',
    'preview_generation': 'Generating Previews',
    'face_analysis': 'Analysing Faces',
    'similarity_cluster': 'Clustering Similar Faces',
    'reindex': 'Rebuilding Index',
    'ai_metadata': 'Generating AI Metadata'
};

type JobUpdater = SetStateAction<BackgroundJob[]>;
type LegacyProgressPayload = {
    processed?: number;
    total?: number;
    message?: string;
    current?: string;
    status?: string;
    overallDone?: number;
    overallTotal?: number;
    overallPercent?: number;
    stages?: Array<{
        stageId: string;
        label: string;
        state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped';
        total?: number;
        done?: number;
    }>;
};

function pruneJobHistory(list: BackgroundJob[]): BackgroundJob[] {
    const active = list.filter(j => !TERMINAL_STATES.has(j.state));
    const terminal = list.filter(j => TERMINAL_STATES.has(j.state)).slice(0, MAX_TERMINAL_JOB_HISTORY);
    return [...active, ...terminal];
}

function getDisplayTitle(event: Extract<DomainEvent, { type: 'JobStarted' }>): string {
    if (event.jobId.startsWith('recog-')) {return 'Recognising Faces';}
    if (event.jobId.startsWith('detect-')) {return 'Detecting Faces';}
    if (event.jobId.startsWith('previews-') || event.jobId.startsWith('preview-')) {return 'Generating Thumbnails';}
    return JOB_TITLE_BY_STAGE[event.pipelineStage] || event.pipelineStage;
}

function updateJobsForProgress(event: Extract<DomainEvent, { type: 'JobProgress' }>): JobUpdater {
    return (prev) => prev.map(job => {
        if (job.id !== event.jobId) {return job;}
        const newPercent = event.totalItems && event.totalItems > 0
            ? (event.processedItems / event.totalItems) * 100
            : undefined;

        return {
            ...job,
            progress: {
                ...job.progress,
                overallDone: event.processedItems,
                overallTotal: event.totalItems,
                overallPercent: newPercent,
                current: event.currentItemPath,
                throughputIps: event.throughputIps,
                errors: event.errorCount,
                indexed: job.stage === 'bulk_ingest' || job.stage === 'scan' ? event.processedItems : job.progress.indexed,
                analysed: job.stage === 'face_analysis' ? event.processedItems : job.progress.analysed,
            }
        };
    });
}

function updateJobsForFailure(event: Extract<DomainEvent, { type: 'JobFailed' }>): JobUpdater {
    return (prev) => prev.map(job => {
        if (job.id !== event.jobId) {return job;}
        return {
            ...job,
            issues: [...job.issues, {
                id: Math.random().toString(),
                severity: event.severity,
                message: event.reason,
                createdAt: new Date().toISOString()
            }]
        };
    });
}

function incrementFaceMetric(
    metric: 'facesFound' | 'facesRecognised',
    amount: number
): JobUpdater {
    return (prev) => prev.map(job => {
        if (job.stage !== 'face_analysis' || job.state !== 'running') {return job;}
        return {
            ...job,
            progress: {
                ...job.progress,
                [metric]: (job.progress[metric] || 0) + amount
            }
        };
    });
}

function createQueuedJob(id: string, stage: PipelineStage, title: string): BackgroundJob {
    return {
        id,
        stage,
        title,
        state: 'queued',
        createdAt: new Date().toISOString(),
        trigger: 'user',
        progress: {
            stages: [],
            overallPercent: undefined
        },
        issues: []
    };
}

function applyJobState(job: BackgroundJob, state: JobState): BackgroundJob {
    return {
        ...job,
        state,
        startedAt: state === 'running' && !job.startedAt ? new Date().toISOString() : job.startedAt,
        finishedAt: (state === 'completed' || state === 'failed') ? new Date().toISOString() : undefined
    };
}

function getLegacyProgressState(status: LegacyProgressPayload['status'], currentState: JobState): JobState {
    if (status === 'running') {return 'running';}
    if (status === 'complete') {return 'completed';}
    if (status === 'error') {return 'failed';}
    return currentState;
}

function coalesceOverallDone(payload: LegacyProgressPayload): number | undefined {
    if (payload.overallDone !== undefined) {return payload.overallDone;}
    return payload.processed;
}

function coalesceOverallTotal(payload: LegacyProgressPayload): number | undefined {
    if (payload.overallTotal !== undefined) {return payload.overallTotal;}
    return payload.total;
}

function computeOverallPercent(done: number | undefined, total: number | undefined, payload: LegacyProgressPayload): number | undefined {
    if (total && total > 0) {
        return ((done || 0) / total) * 100;
    }
    if (payload.overallPercent !== undefined) {
        return payload.overallPercent;
    }
    if (payload.status === 'complete') {
        return 100;
    }
    return undefined;
}

function applyLegacyProgress(job: BackgroundJob, payload: LegacyProgressPayload): BackgroundJob {
    const overallDone = coalesceOverallDone(payload) ?? job.progress.overallDone;
    const overallTotal = coalesceOverallTotal(payload) ?? job.progress.overallTotal;
    const overallPercent = computeOverallPercent(overallDone, overallTotal, payload);
    const nextProgress = {
        ...job.progress,
        overallDone,
        overallTotal,
        overallPercent,
        message: payload.message,
        current: payload.current,
        stages: payload.stages !== undefined ? payload.stages : job.progress.stages
    };

    return {
        ...job,
        state: getLegacyProgressState(payload.status, job.state),
        progress: nextProgress
    };
}

type ProcessEventDeps = {
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    setJobs: Dispatch<SetStateAction<BackgroundJob[]>>;
    updateJobState: (id: string, state: JobState) => void;
    updateJobProgress: (id: string, payload: { status?: string }) => void;
};

function createProcessEvent({ addJob, setJobs, updateJobState, updateJobProgress }: ProcessEventDeps) {
    const handlers = {
        JobStarted: (event: Extract<DomainEvent, { type: 'JobStarted' }>) => {
            addJob(event.jobId, event.pipelineStage as PipelineStage, getDisplayTitle(event));
            updateJobState(event.jobId, 'running');
        },
        JobProgress: (event: Extract<DomainEvent, { type: 'JobProgress' }>) => {
            setJobs(updateJobsForProgress(event));
        },
        JobCompleted: (event: Extract<DomainEvent, { type: 'JobCompleted' }>) => {
            updateJobState(event.jobId, 'completed');
            updateJobProgress(event.jobId, { status: 'complete' });
        },
        JobFailed: (event: Extract<DomainEvent, { type: 'JobFailed' }>) => {
            updateJobState(event.jobId, 'failed');
            setJobs(updateJobsForFailure(event));
        },
        FacesDetected: (event: Extract<DomainEvent, { type: 'FacesDetected' }>) => {
            setJobs(incrementFaceMetric('facesFound', event.faceCount || 0));
        },
        FaceEmbeddingGenerated: () => {
            setJobs(incrementFaceMetric('facesRecognised', 1));
        },
    };

    return (event: DomainEvent) => {
        const handler = handlers[event.type as keyof typeof handlers];
        if (handler) {handler(event as never);}
    };
}

function useAddJob(setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    return useCallback((id: string, stage: PipelineStage, title: string) => {
        const newJob = createQueuedJob(id, stage, title);
        setJobs((prev) => {
            if (prev.find((job) => job.id === id)) {return prev;}
            return pruneJobHistory([newJob, ...prev]);
        });
    }, [setJobs]);
}

function useUpdateJobState(setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    return useCallback((id: string, state: JobState) => {
        setJobs((prev) => pruneJobHistory(prev.map((job) => {
            if (job.id !== id) {return job;}
            return applyJobState(job, state);
        })));
    }, [setJobs]);
}

function useUpdateJobProgress(setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    return useCallback((id: string, payload: LegacyProgressPayload) => {
        setJobs((prev) => prev.map((job) => {
            if (job.id !== id) {return job;}
            return applyLegacyProgress(job, payload);
        }));
    }, [setJobs]);
}

function useRemoveJob(setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    return useCallback((id: string) => {
        setJobs((prev) => prev.filter((job) => job.id !== id));
    }, [setJobs]);
}

export function useJobManager() {
    const [jobs, setJobs] = useState<BackgroundJob[]>([]);
    const addJob = useAddJob(setJobs);
    const updateJobState = useUpdateJobState(setJobs);
    const updateJobProgress = useUpdateJobProgress(setJobs);
    const removeJob = useRemoveJob(setJobs);

    const processEventHandler = useMemo(
        () => createProcessEvent({ addJob, setJobs, updateJobState, updateJobProgress }),
        [addJob, setJobs, updateJobState, updateJobProgress]
    );

    const processEvent = useCallback((event: DomainEvent) => {
        processEventHandler(event);
    }, [processEventHandler]);

    return {
        jobs,
        addJob,
        updateJobState,
        updateJobProgress,
        removeJob,
        processEvent
    };
}
