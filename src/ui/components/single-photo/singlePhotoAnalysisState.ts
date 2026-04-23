import { useEffect, useRef, useState } from 'react';
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

export function useAnalysisUiState(): AnalysisUiBundle {
    const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
    const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
    const [analysisState, setAnalysisState] = useState<AnalysisUiState>('idle');
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    return {
        analysisState,
        setAnalysisState,
        analysisError,
        setAnalysisError,
        analyzingAssetId,
        setAnalyzingAssetId,
        analyzingJobId,
        setAnalyzingJobId
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
        const timeoutId = window.setTimeout(() => {
            setAnalysisError(null);
            setAnalysisState('idle');
            setAnalyzingAssetId(null);
            setAnalyzingJobId(null);
            runStartAiMetadataRef.current = undefined;
            setShowInfoPanel(true);
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
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

type WorkflowFailureTrackingParams = {
    analysisState: AnalysisUiState;
    analyzingAssetId: string | null;
    analyzingJobId: string | null;
    onGetWorkflowRunDetail?: (runId: string) => Promise<WorkflowRunDetailResponse>;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    setAnalysisState: Dispatch<SetStateAction<AnalysisUiState>>;
    setAnalyzingJobId: Dispatch<SetStateAction<string | null>>;
    setAnalyzingAssetId: Dispatch<SetStateAction<string | null>>;
};

type WorkflowFailureCallbacks = Pick<
    WorkflowFailureTrackingParams,
    'setAnalysisError' | 'setAnalysisState' | 'setAnalyzingJobId' | 'setAnalyzingAssetId'
>;

function clearAnalysisRun(params: Pick<WorkflowFailureTrackingParams, 'setAnalyzingJobId' | 'setAnalyzingAssetId'>) {
    params.setAnalyzingJobId(null);
    params.setAnalyzingAssetId(null);
}

function failAnalysisRun(
    params: Pick<WorkflowFailureTrackingParams, 'setAnalysisError' | 'setAnalysisState' | 'setAnalyzingJobId' | 'setAnalyzingAssetId'>,
    message: string,
    cancelled: boolean,
) {
    if (cancelled) {
        return;
    }

    params.setAnalysisError(message);
    params.setAnalysisState('error');
    clearAnalysisRun(params);
}

function resolveTrackedAnalysisWorkflow(params: Pick<
    WorkflowFailureTrackingParams,
    'analysisState' | 'analyzingAssetId' | 'analyzingJobId' | 'onGetWorkflowRunDetail'
>) {
    if (params.analysisState !== 'analyzing') {
        return null;
    }
    if (!params.analyzingJobId || !params.analyzingAssetId || !params.onGetWorkflowRunDetail) {
        return null;
    }

    return {
        activeJobId: params.analyzingJobId,
        workflowRunDetailLoader: params.onGetWorkflowRunDetail,
    };
}

function scheduleWorkflowPoll(pollWorkflowRun: () => Promise<void>) {
    return window.setTimeout(() => {
        void pollWorkflowRun();
    }, 1500);
}

function handleWorkflowPollDetail(params: {
    detail: WorkflowRunDetailResponse;
    cancelled: boolean;
    callbacks: WorkflowFailureCallbacks;
    scheduleNextPoll: () => void;
}): boolean {
    if (params.cancelled) {
        return true;
    }

    const failureMessage = getAnalysisWorkflowFailureMessage(params.detail);
    if (failureMessage) {
        failAnalysisRun(params.callbacks, failureMessage, params.cancelled);
        return true;
    }

    if (params.detail.summary?.status === 'completed') {
        params.callbacks.setAnalyzingJobId(null);
        return true;
    }

    params.scheduleNextPoll();
    return false;
}

function handleWorkflowPollError(
    callbacks: WorkflowFailureCallbacks,
    cancelled: boolean,
    error: unknown,
) {
    const message = error instanceof Error ? error.message : String(error);
    failAnalysisRun(callbacks, message, cancelled);
}

export function useAnalysisWorkflowFailureTracking(params: WorkflowFailureTrackingParams) {
    const {
        analysisState,
        analyzingAssetId,
        analyzingJobId,
        onGetWorkflowRunDetail,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingJobId,
        setAnalyzingAssetId,
    } = params;

    useEffect(() => {
        const trackedWorkflow = resolveTrackedAnalysisWorkflow({
            analysisState,
            analyzingAssetId,
            analyzingJobId,
            onGetWorkflowRunDetail,
        });
        if (!trackedWorkflow) {
            return;
        }

        const { workflowRunDetailLoader, activeJobId } = trackedWorkflow;
        let cancelled = false;
        let timeoutId: number | null = null;
        const callbacks = { setAnalysisError, setAnalysisState, setAnalyzingJobId, setAnalyzingAssetId };

        const scheduleNextPoll = (pollWorkflowRun: () => Promise<void>) => {
            timeoutId = scheduleWorkflowPoll(pollWorkflowRun);
        };

        const pollWorkflowRun = async () => {
            try {
                const detail = await workflowRunDetailLoader(activeJobId);
                handleWorkflowPollDetail({
                    detail,
                    cancelled,
                    callbacks,
                    scheduleNextPoll: () => scheduleNextPoll(pollWorkflowRun),
                });
            } catch (error: unknown) {
                handleWorkflowPollError(callbacks, cancelled, error);
            }
        };

        scheduleNextPoll(pollWorkflowRun);

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [
        analysisState,
        analyzingAssetId,
        analyzingJobId,
        onGetWorkflowRunDetail,
        setAnalysisError,
        setAnalysisState,
        setAnalyzingAssetId,
        setAnalyzingJobId,
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
