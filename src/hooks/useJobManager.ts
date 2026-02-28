import { useState, useCallback } from 'react';
import type { BackgroundJob, JobKind, JobState } from '../types/jobs';
import type { DomainEvent } from '../types/events';

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

        setJobs(prev => {
            // Avoid duplicates
            if (prev.find(j => j.id === id)) return prev;
            return [newJob, ...prev];
        });
    }, []);

    const updateJobState = useCallback((id: string, state: JobState) => {
        // Immediate update for state changes to feel responsive? 
        // Or smooth them too?
        // State changes are rare, immediate is better.
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

    const updateJobProgress = useCallback((id: string, payload: {
        processed?: number;
        total?: number;
        message?: string;
        current?: string;
        status?: string;
    }) => {
        // Legacy support
        setJobs(prev => prev.map(job => {
            if (job.id !== id) return job;
            const newProgress = { ...job.progress };
            if (payload.processed !== undefined) newProgress.overallDone = payload.processed;
            if (payload.total !== undefined) newProgress.overallTotal = payload.total;
            if (newProgress.overallTotal && newProgress.overallTotal > 0) {
                newProgress.overallPercent = (newProgress.overallDone || 0) / newProgress.overallTotal * 100;
            } else if (payload.status === 'complete') {
                newProgress.overallPercent = 100;
            }
            newProgress.message = payload.message;
            newProgress.current = payload.current;

            let state = job.state;
            if (payload.status === 'running') state = 'running';
            if (payload.status === 'complete') state = 'completed';
            if (payload.status === 'error') state = 'failed';

            return { ...job, state, progress: newProgress };
        }));
    }, []);

    // NEW: consume events
    const processEvent = useCallback((event: DomainEvent) => {
        switch (event.type) {
            case 'TaskStarted': {
                const kindTitles: Record<string, string> = {
                    'bulk_ingest': 'Ingesting Library',
                    'scan': 'Scanning Folders',
                    'preview_generation': 'Generating Previews',
                    'face_analysis': 'Analysing Faces',
                    'similarity_cluster': 'Clustering Similar Faces',
                    'reindex': 'Rebuilding Index'
                };
                let displayTitle = kindTitles[event.taskKind] || event.taskKind;
                if (event.taskId.startsWith('recog-')) displayTitle = 'Recognising Faces';
                if (event.taskId.startsWith('detect-')) displayTitle = 'Detecting Faces';
                if (event.taskId.startsWith('previews-') || event.taskId.startsWith('preview-')) displayTitle = 'Generating Thumbnails';

                addJob(event.taskId, event.taskKind as JobKind, displayTitle);
                updateJobState(event.taskId, 'running');
                break;
            }

            case 'TaskProgress':
                setJobs(prev => prev.map(job => {
                    if (job.id === event.taskId) {
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
                                indexed: job.kind === 'bulk_ingest' || job.kind === 'scan' ? event.processedItems : job.progress.indexed,
                                analysed: job.kind === 'face_analysis' ? event.processedItems : job.progress.analysed,
                            }
                        };
                    }
                    return job;
                }));
                break;

            case 'TaskCompleted':
                updateJobState(event.taskId, 'completed');
                updateJobProgress(event.taskId, { status: 'complete' });
                break;

            case 'TaskFailed':
                updateJobState(event.taskId, 'failed');
                setJobs(prev => prev.map(job => {
                    if (job.id === event.taskId) {
                        return {
                            ...job,
                            issues: [...job.issues, {
                                id: Math.random().toString(),
                                severity: event.severity,
                                message: event.reason,
                                createdAt: new Date().toISOString()
                            }]
                        };
                    }
                    return job;
                }));
                break;

            case 'FolderScanRequested':
                addJob(event.scanSessionId, 'bulk_ingest', 'Ingest Session');
                break;
            case 'FacesDetected':
                setJobs(prev => prev.map(job => {
                    if (job.kind === 'face_analysis' && job.state === 'running') {
                        return {
                            ...job,
                            progress: {
                                ...job.progress,
                                facesFound: (job.progress.facesFound || 0) + (event.faceCount || 0)
                            }
                        };
                    }
                    return job;
                }));
                break;
            case 'FaceEmbeddingGenerated':
                setJobs(prev => prev.map(job => {
                    if (job.kind === 'face_analysis' && job.state === 'running') {
                        return {
                            ...job,
                            progress: {
                                ...job.progress,
                                facesRecognised: (job.progress.facesRecognised || 0) + 1
                            }
                        };
                    }
                    return job;
                }));
                break;
            case 'PreviewRequested':
                break;
            case 'PreviewGenerated':
                break;
        }
    }, [addJob, updateJobState, updateJobProgress]);

    return {
        jobs,
        addJob,
        updateJobState,
        updateJobProgress,
        processEvent
    };
}
