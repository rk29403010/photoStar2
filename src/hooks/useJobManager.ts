import { useState, useCallback } from 'react';
import type { BackgroundJob, PipelineStage, JobState } from '../types/jobs';
import type { DomainEvent } from '../types/events';

export function useJobManager() {
    const [jobs, setJobs] = useState<BackgroundJob[]>([]);

    const addJob = useCallback((id: string, stage: PipelineStage, title: string) => {
        const newJob: BackgroundJob = {
            id,
            stage,
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
            case 'JobStarted': {
                const kindTitles: Record<string, string> = {
                    'bulk_ingest': 'Ingesting Library',
                    'scan': 'Scanning Folders',
                    'preview_generation': 'Generating Previews',
                    'face_analysis': 'Analysing Faces',
                    'similarity_cluster': 'Clustering Similar Faces',
                    'reindex': 'Rebuilding Index'
                };
                let displayTitle = kindTitles[event.pipelineStage] || event.pipelineStage;
                if (event.jobId.startsWith('recog-')) displayTitle = 'Recognising Faces';
                if (event.jobId.startsWith('detect-')) displayTitle = 'Detecting Faces';
                if (event.jobId.startsWith('previews-') || event.jobId.startsWith('preview-')) displayTitle = 'Generating Thumbnails';

                addJob(event.jobId, event.pipelineStage as PipelineStage, displayTitle);
                updateJobState(event.jobId, 'running');
                break;
            }

            case 'JobProgress':
                setJobs(prev => prev.map(job => {
                    if (job.id === event.jobId) {
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
                    }
                    return job;
                }));
                break;

            case 'JobCompleted':
                updateJobState(event.jobId, 'completed');
                updateJobProgress(event.jobId, { status: 'complete' });
                break;

            case 'JobFailed':
                updateJobState(event.jobId, 'failed');
                setJobs(prev => prev.map(job => {
                    if (job.id === event.jobId) {
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
                // Removed intentionally: The backend already serves a distinct 'class-onboarding' card named "Photo Onboarding"
                break;
            case 'FacesDetected':
                setJobs(prev => prev.map(job => {
                    if (job.stage === 'face_analysis' && job.state === 'running') {
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
                    if (job.stage === 'face_analysis' && job.state === 'running') {
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
