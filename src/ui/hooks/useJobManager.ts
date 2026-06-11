import { useState, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BackgroundJob, JobState, StageState } from '@contracts/jobs';
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

const WORKFLOW_NODE_LABELS: Record<string, string> = {
    'detect-sensitive-content': 'Scanning for sensitive content',
    'generate-ai-metadata': 'Generating AI tags and descriptions',
    'estimate-photo-date-from-ai': 'Estimating dates from visual cues',
    'face-detection': 'Detecting faces',
    'face-embedding': 'Recognising people',
    'face-clustering': 'Grouping similar faces',
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
    workflowRunId?: string;
    stages?: Array<{
        stageId: string;
        label: string;
        state: StageState;
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

function updateJobsForWorkflowStep(
    runId: string,
    _nodeId: string,
    message?: string,
    current?: string
): JobUpdater {
    return (prev) => prev.map(job => {
        // Find the overlay job tracking this run
        if (job.progress.workflowRunId !== runId) {return job;}

        return {
            ...job,
            progress: {
                ...job.progress,
                message: message ?? job.progress.message,
                current: current ?? job.progress.current,
            }
        };
    });
}

function handleWorkflowStepEvent(event: DomainEvent, setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    if (event.type === 'WorkflowStepStarted') {
        const label = WORKFLOW_NODE_LABELS[event.nodeId] || event.nodeId;
        setJobs(updateJobsForWorkflowStep(event.runId, event.nodeId, label));
    } else if (event.type === 'WorkflowStepCompleted') {
        const label = WORKFLOW_NODE_LABELS[event.nodeId] || event.nodeId;
        setJobs(updateJobsForWorkflowStep(event.runId, event.nodeId, `${label} complete`));
    } else if (event.type === 'WorkflowStepFailed') {
        const label = WORKFLOW_NODE_LABELS[event.nodeId] || event.nodeId;
        setJobs(updateJobsForWorkflowStep(event.runId, event.nodeId, `${label} failed`));
    }
}

function handleWorkflowSubjectEvent(event: DomainEvent, setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    if (event.type === 'WorkflowSubjectStarted') {
        const label = WORKFLOW_NODE_LABELS[event.nodeId] || event.nodeId;
        setJobs(updateJobsForWorkflowStep(event.runId, event.nodeId, label, event.subjectId));
    }
}

function handleBaseEvent(event: DomainEvent, deps: ProcessEventDeps) {
    const { addJob, setJobs, updateJobState, updateJobProgress } = deps;
    if (event.type === 'JobStarted') {
        addJob(event.jobId, event.pipelineStage, getDisplayTitle(event));
        updateJobState(event.jobId, 'running');
    } else if (event.type === 'JobProgress') {
        setJobs(updateJobsForProgress(event));
    } else if (event.type === 'JobCompleted') {
        updateJobState(event.jobId, 'completed');
        updateJobProgress(event.jobId, { status: 'complete' });
    } else if (event.type === 'JobFailed') {
        updateJobState(event.jobId, 'failed');
        setJobs(updateJobsForFailure(event));
    }
}

function handleFaceEvent(event: DomainEvent, setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    if (event.type === 'FacesDetected') {
        setJobs(incrementFaceMetric('facesFound', event.faceCount || 0));
    } else if (event.type === 'FaceEmbeddingGenerated') {
        setJobs(incrementFaceMetric('facesRecognised', 1));
    }
}

function createQueuedJob(id: string, stage: string, title: string): BackgroundJob {
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
        workflowRunId: payload.workflowRunId ?? job.progress.workflowRunId,
        stages: payload.stages ?? job.progress.stages
    };

    return {
        ...job,
        state: getLegacyProgressState(payload.status, job.state),
        progress: nextProgress
    };
}

type ProcessEventDeps = {
    addJob: (id: string, stage: string, title: string) => void;
    setJobs: Dispatch<SetStateAction<BackgroundJob[]>>;
    updateJobState: (id: string, state: JobState) => void;
    updateJobProgress: (id: string, payload: { status?: string }) => void;
};

function createProcessEvent(deps: ProcessEventDeps) {
    return (event: DomainEvent) => {
        handleBaseEvent(event, deps);
        handleFaceEvent(event, deps.setJobs);
        handleWorkflowStepEvent(event, deps.setJobs);
        handleWorkflowSubjectEvent(event, deps.setJobs);
    };
}

function useAddJob(setJobs: Dispatch<SetStateAction<BackgroundJob[]>>) {
    return useCallback((id: string, stage: string, title: string) => {
        const newJob = createQueuedJob(id, stage, title);
        setJobs((prev) => {
            if (prev.some((job) => job.id === id)) {return prev;}
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
