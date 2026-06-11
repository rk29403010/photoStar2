import { useEffect, useEffectEvent, useState } from 'react';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import type { JobState, StageState } from '@contracts/jobs';
import { usePersistedState } from '@ui/hooks/usePersistedState';
import { WorkflowDetailPanel } from './WorkflowDetailPanel';
import { WorkflowSequenceMapTab } from './WorkflowSequenceMapTab';
import { Button, Select } from '../Primitives';
import {
    getWorkflowDetail,
    getWorkflowWorkspaceRefreshIntervalMs,
    getWorkflowVisualiserRequestedRunId,
    getWorkflowWorkspaceRunSelectionValue,
    shouldFitSequenceMapViewport,
    getWorkflowWorkspaceRetryFeedback,
    WORKFLOW_DEFINITION_ONLY_RUN_ID,
    type WorkflowSequenceMapViewport,
} from './workflowWorkspaceModel';
import { scheduleWorkflowRunRefresh } from '@boundary/runtime/workflowOverlayJobs';

type WorkflowWorkspaceProps = {
    readonly workflowId: string;
    readonly onWorkflowIdChange: (workflowId: string) => void;
    readonly onGetWorkflowVisualiser: (workflowId: string, runId?: string | null) => Promise<WorkflowVisualiserModel>;
    readonly onRerunMissingFolderAiMetadata: (runId: string) => Promise<{ runId: string | null; assetCount: number }>;
    readonly addJob: (id: string, stage: string, title: string) => void;
    readonly updateJobState: (id: string, state: JobState) => void;
    readonly updateJobProgress: (id: string, payload: {
        overallDone?: number;
        overallTotal?: number;
        overallPercent?: number;
        message?: string;
        current?: string;
        workflowRunId?: string;
        stages?: Array<{ stageId: string; label: string; state: StageState; total?: number; done?: number }>;
    }) => void;
}

function useWorkflowWorkspacePersistence(workflowId: string) {
    const [persistedViewports, setPersistedViewports] = usePersistedState<Record<string, WorkflowSequenceMapViewport | null>>('ps_workflow_sequence_viewports', {});
    const [sequenceViewport, setSequenceViewport] = useState<WorkflowSequenceMapViewport | null>(() => persistedViewports[workflowId] ?? null);

    return {
        sequenceViewport,
        setPersistedViewport(viewport: WorkflowSequenceMapViewport) {
            setSequenceViewport(viewport);
            setPersistedViewports((current) => ({ ...current, [workflowId]: viewport }));
        },
    };
}

function renderWorkflowWorkspaceState(message: string, tone: 'idle' | 'error') {
    return (
        <div className={`flex h-full items-center justify-center text-sm ${tone === 'error' ? 'text-red-400' : 'text-content-secondary'}`}>
            {message}
        </div>
    );
}

function useWorkflowRetryAction(params: {
    workflowId: string;
    model: WorkflowVisualiserModel | null;
    setSelectedRunSelection: (runId: string | null) => void;
    setSelectedDetailId: (detailId: string | null) => void;
    onRerunMissingFolderAiMetadata: WorkflowWorkspaceProps['onRerunMissingFolderAiMetadata'];
    onGetWorkflowVisualiser: WorkflowWorkspaceProps['onGetWorkflowVisualiser'];
    addJob: WorkflowWorkspaceProps['addJob'];
    updateJobState: WorkflowWorkspaceProps['updateJobState'];
    updateJobProgress: WorkflowWorkspaceProps['updateJobProgress'];
}) {
    const [retryingMissingAiMetadata, setRetryingMissingAiMetadata] = useState(false);
    const [resumeAssetCount, setResumeAssetCount] = useState<number | undefined>(undefined);
    const [resumeRequestCompleted, setResumeRequestCompleted] = useState(false);
    const canRetryMissingAiMetadata = params.workflowId === 'folder_ingest_v1'
        && params.model?.selectedRun?.status === 'failed'
        && typeof params.model.selectedRun.parameters.folderPath === 'string';

    return {
        resumeAssetCount,
        resumeRequestCompleted,
        retryingMissingAiMetadata,
        canRetryMissingAiMetadata,
        clearResumeAssetCount() {
            setResumeAssetCount(undefined);
            setResumeRequestCompleted(false);
        },
        retryMissingAiMetadata() {
            if (!params.model?.selectedRun?.runId || retryingMissingAiMetadata) {
                return;
            }

            setRetryingMissingAiMetadata(true);
            setResumeAssetCount(undefined);
            setResumeRequestCompleted(false);

            const localJobId = `resume_missing_folder_ai_metadata_overlay_${Date.now()}`;
            params.addJob(localJobId, 'ai_metadata', 'Resuming folder ingest');
            params.updateJobState(localJobId, 'starting');

            void params.onRerunMissingFolderAiMetadata(params.model.selectedRun.runId)
                .then((result) => {
                    setResumeAssetCount(result.assetCount);
                    setResumeRequestCompleted(true);
                    if (result.runId) {
                        params.updateJobState(localJobId, 'running');
                        params.setSelectedRunSelection(result.runId);
                        params.setSelectedDetailId(null);

                        // Start tracking the background job for overlay feedback
                        scheduleWorkflowRunRefresh({
                            request: async <T,>(options: { payload?: Record<string, unknown> }): Promise<T> => {
                                return await params.onGetWorkflowVisualiser(params.workflowId, options.payload?.runId as string) as unknown as T;
                            },
                            updateJobState: params.updateJobState,
                            updateJobProgress: params.updateJobProgress,
                            refreshLibrary: () => { /* No-op or find a way to refresh */ },
                            refreshSystemJobs: () => { /* No-op */ },
                            localJobId,
                            runId: result.runId,
                            workflowId: params.workflowId,
                            title: 'Resuming folder ingest',
                        });
                    } else {
                        params.updateJobState(localJobId, 'completed');
                    }
                })
                .catch((error) => {
                    params.updateJobState(localJobId, 'failed');
                    console.error('Failed to resume workflow:', error);
                })
                .finally(() => {
                    setRetryingMissingAiMetadata(false);
                });
        },
    };
}

function useWorkflowWorkspaceData(
    workflowId: string,
    selectedRunId: string | null,
    onGetWorkflowVisualiser: WorkflowWorkspaceProps['onGetWorkflowVisualiser'],
) {
    const [model, setModel] = useState<WorkflowVisualiserModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadWorkflowVisualiser = useEffectEvent(async (
        nextWorkflowId: string,
        nextSelectedRunId: string | null,
        onLoaded: (nextModel: WorkflowVisualiserModel) => void,
        onFailed: (nextError: unknown) => void,
    ) => {
        try {
            onLoaded(await onGetWorkflowVisualiser(nextWorkflowId, nextSelectedRunId));
        } catch (nextError) {
            onFailed(nextError);
        }
    });

    useEffect(() => {
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const fetchModel = (showLoading: boolean) => {
            if (showLoading) {
                setLoading(true);
            }
            setError(null);

            void loadWorkflowVisualiser(
                workflowId,
                selectedRunId,
                (nextModel) => {
                    if (cancelled) {return;}
                    setModel(nextModel);
                    const refreshIntervalMs = getWorkflowWorkspaceRefreshIntervalMs(nextModel);
                    if (refreshIntervalMs !== null) {
                        timeoutId = setTimeout(fetchModel, refreshIntervalMs, false);
                    }
                },
                (nextError: unknown) => {
                    if (cancelled) {return;}
                    setError(String(nextError));
                },
            )
                .finally(() => {
                    if (cancelled) {return;}
                    setLoading(false);
                });
        };

        fetchModel(true);

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        };
    }, [selectedRunId, workflowId]);

    return { model, loading, error };
}

type FloatingWorkflowSelectorComboProps = {
    readonly workflowId: string;
    readonly model: WorkflowVisualiserModel;
    readonly selectedRunValue: string;
    readonly retryAction: ReturnType<typeof useWorkflowRetryAction>;
    readonly retryFeedback: string | null;
    readonly onWorkflowIdChange: (workflowId: string) => void;
    readonly setSelectedRunSelection: (runSelection: string | null) => void;
    readonly setSelectedDetailId: (detailId: string | null) => void;
};

function FloatingWorkflowSelectorCombo({
    workflowId,
    model,
    selectedRunValue,
    retryAction,
    retryFeedback,
    onWorkflowIdChange,
    setSelectedRunSelection,
    setSelectedDetailId,
}: FloatingWorkflowSelectorComboProps) {
    const linkedRecoveryRuns = (model.selectedRun?.linkedRuns ?? []).filter((run) => run.relationship === 'recovery');
    return (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 p-3 rounded-xl border border-content/10 bg-surface/90 backdrop-blur-xs shadow-md w-72">
            <div className="flex flex-col gap-1">
                <label htmlFor="workflow-selector" className="text-[10px] font-semibold uppercase tracking-wider text-content-secondary">Workflow</label>
                <Select
                    id="workflow-selector"
                    value={workflowId}
                    onChange={(event) => {
                        onWorkflowIdChange(event.target.value);
                        setSelectedRunSelection(null);
                        setSelectedDetailId(null);
                    }}
                    aria-label="Workflow"
                    className="text-xs py-1"
                >
                    {model.availableWorkflows.map((workflow) => (
                        <option key={workflow.workflowId} value={workflow.workflowId}>
                            {workflow.displayName}
                        </option>
                    ))}
                </Select>
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="run-context-selector" className="text-[10px] font-semibold uppercase tracking-wider text-content-secondary">Run Context</label>
                <Select
                    id="run-context-selector"
                    value={selectedRunValue}
                    onChange={(event) => {
                        setSelectedRunSelection(event.target.value === WORKFLOW_DEFINITION_ONLY_RUN_ID ? WORKFLOW_DEFINITION_ONLY_RUN_ID : event.target.value || null);
                        setSelectedDetailId(null);
                        if (!retryAction.retryingMissingAiMetadata) {
                            retryAction.clearResumeAssetCount();
                        }
                    }}
                    aria-label="Run context"
                    className="text-xs py-1"
                >
                    <option value={WORKFLOW_DEFINITION_ONLY_RUN_ID}>Definition only</option>
                    {model.availableRuns.map((run) => (
                        <option key={run.runId} value={run.runId}>
                            {new Date(run.createdAt).toLocaleString()} · {run.status}
                        </option>
                    ))}
                </Select>
            </div>

            {linkedRecoveryRuns.length > 0 && (
                <div className="space-y-0.5 text-[10px] text-green-500">
                    {linkedRecoveryRuns.map((run) => (
                        <div key={run.runId}>
                            Recovered by {run.displayName} · {run.status} · {run.completedItems}/{run.totalItems}
                        </div>
                    ))}
                </div>
            )}

            {retryAction.canRetryMissingAiMetadata && (
                <Button
                    onClick={retryAction.retryMissingAiMetadata}
                    disabled={retryAction.retryingMissingAiMetadata}
                    className="text-[10px] font-semibold uppercase tracking-wider py-1.5"
                >
                    {retryAction.retryingMissingAiMetadata ? 'Starting resume...' : 'Resume Workflow'}
                </Button>
            )}
            {retryFeedback && (
                <div className="text-[10px] text-brand-accent">{retryFeedback}</div>
            )}
        </div>
    );
}

function renderWorkflowWorkspaceReadyState(params: {
    model: WorkflowVisualiserModel;
    workflowId: string;
    selectedRunSelection: string | null;
    selectedDetailId: string | null;
    sequenceViewport: WorkflowSequenceMapViewport | null;
    setPersistedViewport: (viewport: WorkflowSequenceMapViewport) => void;
    setSelectedDetailId: (detailId: string | null) => void;
    setSelectedRunSelection: (runSelection: string | null) => void;
    onWorkflowIdChange: (workflowId: string) => void;
    retryAction: ReturnType<typeof useWorkflowRetryAction>;
}) {
    const selectedDetail = getWorkflowDetail(params.model, params.selectedDetailId);
    const selectedRunValue = getWorkflowWorkspaceRunSelectionValue(params.selectedRunSelection, params.model.selectedRun?.runId ?? null);
    const retryFeedback = getWorkflowWorkspaceRetryFeedback({
        loading: params.retryAction.retryingMissingAiMetadata,
        assetCount: params.retryAction.resumeAssetCount,
        resumeRequestCompleted: params.retryAction.resumeRequestCompleted,
        selectedRun: params.model.selectedRun,
    });

    const totalStages = params.model.tabs.progression.stages.length;
    let selectedStageIndex = -1;
    if (params.selectedDetailId) {
        selectedStageIndex = params.model.tabs.progression.stages.findIndex(
            (s) => s.id === params.selectedDetailId
        );
        if (selectedStageIndex === -1) {
            selectedStageIndex = params.model.tabs.progression.stages.findIndex(
                (s) => s.nodeIds.includes(params.selectedDetailId!)
            );
        }
    }
    const isLeftSided = selectedStageIndex !== -1 && selectedStageIndex < totalStages / 2;
    const popupPositionClass = isLeftSided ? 'right-[19.5rem]' : 'left-4';

    return (
        <div className="relative w-full h-full min-h-0 bg-surface text-content overflow-hidden">
            <WorkflowSequenceMapTab
                stages={params.model.tabs.progression.stages}
                nodes={params.model.tabs.graph.nodes}
                edges={params.model.tabs.graph.edges}
                onSelectDetail={params.setSelectedDetailId}
                selectedDetailId={params.selectedDetailId}
                viewport={params.sequenceViewport}
                shouldFitViewport={shouldFitSequenceMapViewport(params.sequenceViewport)}
                onViewportChange={params.setPersistedViewport}
                showRuntimeDetails={params.model.selectedRun !== null}
            />

            <FloatingWorkflowSelectorCombo
                workflowId={params.workflowId}
                model={params.model}
                selectedRunValue={selectedRunValue}
                retryAction={params.retryAction}
                retryFeedback={retryFeedback}
                onWorkflowIdChange={params.onWorkflowIdChange}
                setSelectedRunSelection={params.setSelectedRunSelection}
                setSelectedDetailId={params.setSelectedDetailId}
            />

            {/* Overlaid Properties Box (Detail Panel) */}
            {selectedDetail && (
                <div className={`absolute top-4 ${popupPositionClass} z-10 w-80 shadow-xl max-h-[85vh] overflow-y-auto`}>
                    <WorkflowDetailPanel
                        detail={selectedDetail}
                        onClose={() => params.setSelectedDetailId(null)}
                        onSelectDetail={params.setSelectedDetailId}
                        showRuntimeDetails={params.model.selectedRun !== null}
                    />
                </div>
            )}
        </div>
    );
}

function ActiveWorkflowWorkspace({
    workflowId,
    onWorkflowIdChange,
    onGetWorkflowVisualiser,
    onRerunMissingFolderAiMetadata,
    addJob,
    updateJobState,
    updateJobProgress,
}: WorkflowWorkspaceProps) {
    const [selectedRunSelection, setSelectedRunSelection] = useState<string | null>(null);
    const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
    const {
        sequenceViewport,
        setPersistedViewport,
    } = useWorkflowWorkspacePersistence(workflowId);
    const requestedRunId = getWorkflowVisualiserRequestedRunId(selectedRunSelection);
    const { model, loading, error } = useWorkflowWorkspaceData(workflowId, requestedRunId ?? null, onGetWorkflowVisualiser);
    const retryAction = useWorkflowRetryAction({
        workflowId,
        model,
        setSelectedRunSelection,
        setSelectedDetailId,
        onRerunMissingFolderAiMetadata,
        onGetWorkflowVisualiser,
        addJob,
        updateJobState,
        updateJobProgress,
    });

    if (loading) {
        return renderWorkflowWorkspaceState('Loading workflow visualiser...', 'idle');
    }

    if (error || !model) {
        return renderWorkflowWorkspaceState(error ?? 'Workflow visualiser unavailable.', 'error');
    }

    return renderWorkflowWorkspaceReadyState({
        model,
        workflowId,
        selectedRunSelection,
        selectedDetailId,
        sequenceViewport,
        setPersistedViewport,
        setSelectedDetailId,
        setSelectedRunSelection,
        onWorkflowIdChange,
        retryAction,
    });
}

export function WorkflowWorkspace(props: WorkflowWorkspaceProps) {
    return <ActiveWorkflowWorkspace key={props.workflowId} {...props} />;
}
