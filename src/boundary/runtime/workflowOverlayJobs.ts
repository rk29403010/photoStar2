import type { JobState, PipelineStage } from '@contracts/jobs';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { requestWorkflowRunDetail } from '@boundary/runtime/workflowRunDetail';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';
import type { NotificationItem } from '@contracts/usePhotoLibrary.types';

type ScheduleWorkflowRunRefreshParams = {
    request: RequestFn;
    updateJobState: (id: string, state: JobState) => void;
    updateJobProgress?: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        workflowRunId?: string;
        stages?: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
    }) => void;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshSystemJobs: () => void;
    localJobId: string;
    runId: string;
    workflowId?: string;
    title: string;
    addNotification?: (
        type: NotificationItem['type'],
        title: string,
        options?: {
            message?: string;
            actionLabel?: string;
            actionKind?: NotificationItem['actionKind'];
            actionPayload?: NotificationItem['actionPayload'];
        }
    ) => void;
    onCompleted?: () => void;
};

type StartWorkflowWithOverlayJobParams = {
    request: RequestFn;
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    updateJobState: (id: string, state: JobState) => void;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshSystemJobs: () => void;
    idPrefix: string;
    command: string;
    payload?: Record<string, unknown>;
    workflowId?: string;
    stage: PipelineStage;
    title: string;
    addNotification?: (
        type: NotificationItem['type'],
        title: string,
        options?: {
            message?: string;
            actionLabel?: string;
            actionKind?: NotificationItem['actionKind'];
            actionPayload?: NotificationItem['actionPayload'];
        }
    ) => void;
    updateJobProgress?: ScheduleWorkflowRunRefreshParams['updateJobProgress'];
    onCompleted?: () => void;
};

function formatStepLabel(nodeId: string): string {
    if (!nodeId) {
        return 'Workflow step';
    }
    const label = nodeId.replace(/[-_]+/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function toStageState(status: string): 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped' {
    if (status === 'completed') {return 'succeeded';}
    if (status === 'failed') {return 'failed';}
    if (status === 'running') {return 'running';}
    if (status === 'queued') {return 'queued';}
    return 'idle';
}

type WorkflowPollSnapshot = {
    status: string;
    totalItems: number;
    completedItems: number;
    failedStep: WorkflowRunStep | undefined;
    currentStep: WorkflowRunStep | undefined;
    stages: Array<{ stageId: string; label: string; state: 'idle' | 'queued' | 'running' | 'succeeded' | 'warning' | 'failed' | 'skipped'; total?: number; done?: number }>;
};

type WorkflowRunStep = {
    nodeId: string;
    status: string;
    totalItems: number;
    completedItems: number;
    failedSubjects?: Array<{ originalPath?: string }>;
    errorMessage?: string;
};

function refreshWorkflowSurfaces(params: ScheduleWorkflowRunRefreshParams) {
    params.refreshLibrary({ preservePagingState: true });
    params.refreshSystemJobs();
}

function toStages(steps: WorkflowRunStep[] | undefined): WorkflowPollSnapshot['stages'] {
    return (steps ?? []).map((step) => ({
        stageId: step.nodeId,
        label: formatStepLabel(step.nodeId),
        state: toStageState(step.status),
        total: step.totalItems,
        done: step.completedItems,
    }));
}

function toSnapshot(detail: Awaited<ReturnType<typeof requestWorkflowRunDetail>>): WorkflowPollSnapshot {
    const status = String(detail.summary?.status || '');
    const totalItems = Number(detail.summary?.totalItems ?? 0);
    const completedItems = Number(detail.summary?.completedItems ?? 0);
    const failedStep = detail.steps?.find((step) => step.status === 'failed') as WorkflowRunStep | undefined;
    const runningStep = detail.steps?.find((step) => step.status === 'running') as WorkflowRunStep | undefined;
    const currentStep = runningStep ?? failedStep;
    const stages = toStages(detail.steps);
    return { status, totalItems, completedItems, failedStep, currentStep, stages };
}

function applySnapshotProgress(params: ScheduleWorkflowRunRefreshParams, snapshot: WorkflowPollSnapshot) {
    params.updateJobProgress?.(params.localJobId, {
        overallDone: snapshot.completedItems,
        overallTotal: snapshot.totalItems,
        overallPercent: snapshot.totalItems > 0 ? (snapshot.completedItems / snapshot.totalItems) * 100 : undefined,
        message: snapshot.currentStep
            ? `${formatStepLabel(snapshot.currentStep.nodeId)} ${snapshot.currentStep.completedItems}/${snapshot.currentStep.totalItems}`
            : undefined,
        current: snapshot.failedStep?.failedSubjects?.[0]?.originalPath,
        workflowRunId: params.runId,
        stages: snapshot.stages,
    });
}

function handleCompleted(params: ScheduleWorkflowRunRefreshParams, snapshot: WorkflowPollSnapshot) {
    params.updateJobState(params.localJobId, 'completed');
    params.refreshLibrary({ preservePagingState: true });
    params.refreshSystemJobs();
    params.addNotification?.('success', `${params.title} complete`, {
        message: snapshot.totalItems > 0 ? `${snapshot.completedItems}/${snapshot.totalItems} items completed.` : undefined,
    });
    params.onCompleted?.();
}

function handleFailed(params: ScheduleWorkflowRunRefreshParams, snapshot: WorkflowPollSnapshot) {
    params.updateJobState(params.localJobId, 'failed');
    params.refreshSystemJobs();
    params.addNotification?.('error', `${params.title} failed`, {
        message: snapshot.failedStep?.errorMessage ?? 'Workflow failed.',
        actionLabel: 'Open workflow',
        actionKind: 'open_workflow',
        actionPayload: { workflowId: params.workflowId },
    });
}

function scheduleNextPoll(poll: () => Promise<void>) {
    globalThis.setTimeout(() => {
        void poll();
    }, 1500);
}

export function scheduleWorkflowRunRefresh(params: ScheduleWorkflowRunRefreshParams) {
    const poll = async () => {
        refreshWorkflowSurfaces(params);

        try {
            const detail = await requestWorkflowRunDetail(params.request, params.runId);
            const snapshot = toSnapshot(detail);
            applySnapshotProgress(params, snapshot);

            if (snapshot.status === 'completed') {
                handleCompleted(params, snapshot);
                return;
            }
            if (snapshot.status === 'failed') {
                handleFailed(params, snapshot);
                return;
            }
        } catch {
            params.updateJobState(params.localJobId, 'failed');
            params.refreshSystemJobs();
            return;
        }
        scheduleNextPoll(poll);
    };

    scheduleNextPoll(poll);
}

export async function startWorkflowWithOverlayJob(params: StartWorkflowWithOverlayJobParams): Promise<string> {
    const localJobId = `${params.idPrefix}-overlay-${Date.now()}`;
    params.addJob(localJobId, params.stage, params.title);
    params.updateJobState(localJobId, 'starting');

    let runId = '';
    try {
        runId = await params.request<string>({
            idPrefix: `${params.idPrefix}_${Date.now()}`,
            command: params.command,
            payload: params.payload ?? {},
            timeoutMs: 10000,
            select: (data) => String(data?.runId || ''),
        });
    } catch (error) {
        params.updateJobState(localJobId, 'failed');
        params.refreshSystemJobs();
        params.addNotification?.('error', `${params.title} failed`, {
            message: error instanceof Error ? error.message : 'Workflow failed to start.',
        });
        return '';
    }

    if (!runId) {
        params.updateJobState(localJobId, 'failed');
        params.refreshSystemJobs();
        params.addNotification?.('error', `${params.title} failed`, {
            message: 'Workflow failed to start.',
        });
        return '';
    }

    params.updateJobState(localJobId, 'running');
    scheduleWorkflowRunRefresh({
        request: params.request,
        updateJobState: params.updateJobState,
        refreshLibrary: params.refreshLibrary,
        refreshSystemJobs: params.refreshSystemJobs,
        localJobId,
        runId,
        workflowId: params.workflowId,
        title: params.title,
        addNotification: params.addNotification,
        updateJobProgress: params.updateJobProgress,
        onCompleted: params.onCompleted,
    });

    return runId;
}
