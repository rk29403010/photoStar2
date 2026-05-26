import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import type { WorkflowRunDetailResponse } from '@boundary/runtime/workflowRunDetail';
import type { AnalysisState } from './PhotoViewport';
import { getAnalysisWorkflowFailureMessage, shouldCompleteAnalysisRun } from './singlePhotoAnalysisTracking';

export type AnalysisUiState = 'idle' | 'analyzing' | 'cancelling' | 'error';

export type AnalysisUiBundle = {
    analysisState: AnalysisUiState;
    setAnalysisState: Dispatch<SetStateAction<AnalysisUiState>>;
    analysisError: string | null;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    analyzingAssetId: string | null;
    setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>;
    analyzingJobId: string | null;
    setAnalyzingJobId: Dispatch<SetStateAction<string | null>>;
};

export type AssetAnalysisState = {
    jobId: string | null;
    state: AnalysisUiState;
    error: string | null;
};

function updateAssetProperty<K extends keyof AssetAnalysisState>(
    setAnalyses: Dispatch<SetStateAction<Record<string, AssetAnalysisState>>>,
    assetId: string | null,
    key: K,
    value: SetStateAction<AssetAnalysisState[K]>
) {
    if (!assetId) {return;}
    setAnalyses(prev => {
        const current = prev[assetId] || { jobId: null, state: 'idle', error: null };
        const nextValue = typeof value === 'function' ? (value as (prev: AssetAnalysisState[K]) => AssetAnalysisState[K])(current[key]) : value;
        return {
            ...prev,
            [assetId]: { ...current, [key]: nextValue }
        };
    });
}

function updateAssetAnalysis(
    setAnalyses: Dispatch<SetStateAction<Record<string, AssetAnalysisState>>>,
    assetId: string,
    update: Partial<AssetAnalysisState>
) {
    setAnalyses(prev => {
        const current = prev[assetId] || { jobId: null, state: 'idle', error: null };
        return {
            ...prev,
            [assetId]: { ...current, ...update }
        };
    });
}

function removeAssetAnalysis(
    setAnalyses: Dispatch<SetStateAction<Record<string, AssetAnalysisState>>>,
    assetId: string
) {
    setAnalyses(prev => {
        const next = { ...prev };
        delete next[assetId];
        return next;
    });
}

export function useAnalysisUiState(currentAssetId: string | null): AnalysisUiBundle & {
    analyses: Record<string, AssetAnalysisState>;
    setAssetAnalysis: (assetId: string, update: Partial<AssetAnalysisState>) => void;
    clearAssetAnalysis: (assetId: string) => void;
} {
    const [analyses, setAnalyses] = useState<Record<string, AssetAnalysisState>>({});

    const setAssetAnalysis = useCallback((assetId: string, update: Partial<AssetAnalysisState>) => {
        updateAssetAnalysis(setAnalyses, assetId, update);
    }, []);

    const clearAssetAnalysis = useCallback((assetId: string) => {
        removeAssetAnalysis(setAnalyses, assetId);
    }, []);

    const currentAnalysis = currentAssetId ? analyses[currentAssetId] : null;
    const analysisState = currentAnalysis?.state ?? 'idle';
    const analysisError = currentAnalysis?.error ?? null;
    const analyzingAssetId = (currentAnalysis && currentAnalysis.state === 'analyzing') ? currentAssetId : null;
    const analyzingJobId = currentAnalysis?.jobId ?? null;

    const setAnalysisState = useCallback((state: SetStateAction<AnalysisUiState>) => {
        updateAssetProperty(setAnalyses, currentAssetId, 'state', state);
    }, [currentAssetId]);

    const setAnalysisError = useCallback((error: SetStateAction<string | null>) => {
        updateAssetProperty(setAnalyses, currentAssetId, 'error', error);
    }, [currentAssetId]);

    const setAnalyzingAssetId = useCallback((id: SetStateAction<string | null>) => {
        const targetId = typeof id === 'function' ? (id as (prev: string | null) => string | null)(currentAssetId) : id;
        if (!targetId) {
            if (currentAssetId) {
                clearAssetAnalysis(currentAssetId);
            }
        } else {
            setAssetAnalysis(targetId, { state: 'analyzing' });
        }
    }, [currentAssetId, setAssetAnalysis, clearAssetAnalysis]);

    const setAnalyzingJobId = useCallback((jobId: SetStateAction<string | null>) => {
        updateAssetProperty(setAnalyses, currentAssetId, 'jobId', jobId);
    }, [currentAssetId]);

    return {
        analysisState,
        setAnalysisState,
        analysisError,
        setAnalysisError,
        analyzingAssetId,
        setAnalyzingAssetId,
        analyzingJobId,
        setAnalyzingJobId,
        analyses,
        setAssetAnalysis,
        clearAssetAnalysis
    };
}

export function useAnalysisTracking(params: {
    analyzingAssetId: string | null;
    currentAssetId: string | undefined;
    assetAiMetadata: Asset['ai_metadata'] | undefined;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    setAnalysisState: Dispatch<SetStateAction<AnalysisUiState>>;
    setAnalyzingJobId: Dispatch<SetStateAction<string | null>>;
    setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>;
    setShowInfoPanel: (v: boolean) => void;
}) {
    const {
        analyzingAssetId,
        currentAssetId,
        assetAiMetadata,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
        setShowInfoPanel
    } = params;
    const completedAssetIdRef = useRef<string | null>(null);
    const runStartAiMetadataRef = useRef<Asset['ai_metadata'] | undefined>(undefined);
    const activeRunAssetIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!analyzingAssetId) {
            completedAssetIdRef.current = null;
            runStartAiMetadataRef.current = undefined;
            activeRunAssetIdRef.current = null;
            return;
        }

        if (activeRunAssetIdRef.current === analyzingAssetId) {
            return;
        }

        activeRunAssetIdRef.current = analyzingAssetId;
        if (currentAssetId === analyzingAssetId) {
            runStartAiMetadataRef.current = assetAiMetadata;
        }
    }, [
        analyzingAssetId,
        currentAssetId,
        assetAiMetadata,
    ]);

    useEffect(() => {
        if (!shouldCompleteAnalysisRun({
            analyzingAssetId,
            currentAssetId,
            currentAiMetadata: assetAiMetadata,
            runStartAiMetadata: runStartAiMetadataRef.current,
            completedAssetId: completedAssetIdRef.current,
        })) {
            return;
        }

        completedAssetIdRef.current = analyzingAssetId;
        const timeoutId = globalThis.setTimeout(() => {
            setAnalysisError(null);
            setAnalysisState('idle');
            setAnalyzingAssetId(null);
            setAnalyzingJobId(null);
            runStartAiMetadataRef.current = undefined;
            setShowInfoPanel(true);
        }, 0);

        return () => {
            globalThis.clearTimeout(timeoutId);
        };
    }, [
        analyzingAssetId,
        currentAssetId,
        assetAiMetadata,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
        setShowInfoPanel
    ]);
}



function pollWorkflowRun(params: {
    assetId: string;
    jobId: string;
    currentAssetId: string | undefined;
    onGetWorkflowRunDetail: (runId: string) => Promise<WorkflowRunDetailResponse>;
    setAssetAnalysis: (assetId: string, update: Partial<AssetAnalysisState>) => void;
    clearAssetAnalysis: (assetId: string) => void;
    isCancelled: () => boolean;
    onScheduleNext: (poll: () => Promise<void>) => void;
}) {
    const { assetId, jobId, currentAssetId, onGetWorkflowRunDetail, setAssetAnalysis, clearAssetAnalysis, isCancelled, onScheduleNext } = params;
    const poll = async () => {
        if (isCancelled()) {return;}
        try {
            const detail = await onGetWorkflowRunDetail(jobId);
            if (isCancelled()) {return;}

            const failureMessage = getAnalysisWorkflowFailureMessage(detail);
            if (failureMessage) {
                setAssetAnalysis(assetId, { state: 'error', error: failureMessage, jobId: null });
                return;
            }

            if (detail.summary?.status === 'completed') {
                if (currentAssetId === assetId) {
                    setAssetAnalysis(assetId, { jobId: null });
                } else {
                    clearAssetAnalysis(assetId);
                }
                return;
            }

            onScheduleNext(poll);
        } catch (error: unknown) {
            if (isCancelled()) {return;}
            const message = error instanceof Error ? error.message : String(error);
            setAssetAnalysis(assetId, { state: 'error', error: message, jobId: null });
        }
    };
    void poll();
}

export function useAnalysisWorkflowFailureTracking(params: {
    analyses: Record<string, AssetAnalysisState>;
    setAssetAnalysis: (assetId: string, update: Partial<AssetAnalysisState>) => void;
    clearAssetAnalysis: (assetId: string) => void;
    currentAssetId: string | undefined;
    onGetWorkflowRunDetail?: (runId: string) => Promise<WorkflowRunDetailResponse>;
}) {
    const { analyses, setAssetAnalysis, clearAssetAnalysis, currentAssetId, onGetWorkflowRunDetail } = params;

    useEffect(() => {
        if (!onGetWorkflowRunDetail) {
            return;
        }

        const activeJobs = Object.entries(analyses).filter(
            ([_, val]) => val.state === 'analyzing' && val.jobId
        );

        if (activeJobs.length === 0) {
            return;
        }

        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];

        activeJobs.forEach(([assetId, val]) => {
            pollWorkflowRun({
                assetId,
                jobId: val.jobId!,
                currentAssetId,
                onGetWorkflowRunDetail,
                setAssetAnalysis,
                clearAssetAnalysis,
                isCancelled: () => cancelled,
                onScheduleNext: (poll) => {
                    const tid = globalThis.setTimeout(() => { void poll(); }, 1500);
                    timers.push(tid);
                }
            });
        });

        return () => {
            cancelled = true;
            timers.forEach((t) => globalThis.clearTimeout(t));
        };
    }, [
        analyses,
        setAssetAnalysis,
        clearAssetAnalysis,
        currentAssetId,
        onGetWorkflowRunDetail,
    ]);
}

export function buildAnalysisState(bundle: AnalysisUiBundle): AnalysisState {
    return {
        analysisState: bundle.analysisState,
        setAnalysisState: bundle.setAnalysisState,
        analysisError: bundle.analysisError,
        setAnalysisError: bundle.setAnalysisError,
        analyzingAssetId: bundle.analyzingAssetId,
        setAnalyzingAssetId: bundle.setAnalyzingAssetId,
        setAnalyzingJobId: bundle.setAnalyzingJobId
    };
}
