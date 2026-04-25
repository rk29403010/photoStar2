import { useEffect, useEffectEvent, useState } from 'react';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import { usePersistedState } from '@ui/hooks/usePersistedState';
import { WorkflowDetailPanel } from './WorkflowDetailPanel';
import { WorkflowOverviewTab } from './WorkflowOverviewTab';
import { WorkflowProgressionTab } from './WorkflowProgressionTab';
import { WorkflowRuntimeGraphTab } from './WorkflowRuntimeGraphTab';
import { WorkflowSequenceMapTab } from './WorkflowSequenceMapTab';
import { WorkflowTextTab } from './WorkflowTextTab';
import { WorkflowWorkspaceHeader } from './WorkflowWorkspaceHeader';
import {
    getDefaultWorkflowWorkspaceTab,
    getWorkflowDetail,
    getWorkflowWorkspaceRefreshIntervalMs,
    getWorkflowVisualiserRequestedRunId,
    getWorkflowWorkspaceRunSelectionValue,
    shouldFitSequenceMapViewport,
    tabSupportsInspector,
    type WorkflowSequenceMapViewport,
    type WorkflowWorkspaceTabId,
} from './workflowWorkspaceModel';

interface WorkflowWorkspaceProps {
    workflowId: string;
    onWorkflowIdChange: (workflowId: string) => void;
    onGetWorkflowVisualiser: (workflowId: string, runId?: string | null) => Promise<WorkflowVisualiserModel>;
    onRerunMissingFolderAiMetadata: (runId: string) => Promise<{ runId: string | null; assetCount: number }>;
}

function useWorkflowWorkspacePersistence(workflowId: string) {
    const [persistedTabs, setPersistedTabs] = usePersistedState<Record<string, WorkflowWorkspaceTabId>>('ps_workflow_workspace_tabs', {});
    const [persistedViewports, setPersistedViewports] = usePersistedState<Record<string, WorkflowSequenceMapViewport | null>>('ps_workflow_sequence_viewports', {});
    const [activeTab, setActiveTab] = useState<WorkflowWorkspaceTabId>(() => persistedTabs[workflowId] ?? getDefaultWorkflowWorkspaceTab());
    const [sequenceViewport, setSequenceViewport] = useState<WorkflowSequenceMapViewport | null>(() => persistedViewports[workflowId] ?? null);

    return {
        activeTab,
        sequenceViewport,
        setPersistedTab(nextTab: WorkflowWorkspaceTabId) {
            setActiveTab(nextTab);
            setPersistedTabs((current) => ({ ...current, [workflowId]: nextTab }));
        },
        setPersistedViewport(viewport: WorkflowSequenceMapViewport) {
            setSequenceViewport(viewport);
            setPersistedViewports((current) => ({ ...current, [workflowId]: viewport }));
        },
    };
}

function renderWorkflowWorkspaceState(message: string, tone: 'idle' | 'error') {
    return (
        <div className={`flex h-full items-center justify-center text-sm ${tone === 'error' ? 'text-red-300' : 'text-gray-400'}`}>
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
            void params.onRerunMissingFolderAiMetadata(params.model.selectedRun.runId)
                .then((result) => {
                    setResumeAssetCount(result.assetCount);
                    setResumeRequestCompleted(true);
                    if (result.runId) {
                        params.setSelectedRunSelection(result.runId);
                        params.setSelectedDetailId(null);
                    }
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
                        timeoutId = setTimeout(() => {
                            fetchModel(false);
                        }, refreshIntervalMs);
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

function WorkflowWorkspaceContent(params: {
    model: WorkflowVisualiserModel;
    activeTab: WorkflowWorkspaceTabId;
    onSelectDetail: (detailId: string) => void;
    sequenceViewport: WorkflowSequenceMapViewport | null;
    onSequenceViewportChange: (viewport: WorkflowSequenceMapViewport) => void;
}) {
    if (params.activeTab === 'overview') {
        return <WorkflowOverviewTab overview={params.model.tabs.overview} selectedRun={params.model.selectedRun} />;
    }

    if (params.activeTab === 'progression') {
        return <WorkflowProgressionTab stages={params.model.tabs.progression.stages} onSelectDetail={params.onSelectDetail} />;
    }

    if (params.activeTab === 'graph') {
        return (
            <WorkflowRuntimeGraphTab
                nodes={params.model.tabs.graph.nodes}
                edges={params.model.tabs.graph.edges}
                onSelectDetail={params.onSelectDetail}
                showRuntimeDetails={params.model.selectedRun !== null}
            />
        );
    }

    if (params.activeTab === 'sequence') {
        return (
            <WorkflowSequenceMapTab
                stages={params.model.tabs.progression.stages}
                nodes={params.model.tabs.graph.nodes}
                edges={params.model.tabs.graph.edges}
                onSelectDetail={params.onSelectDetail}
                viewport={params.sequenceViewport}
                shouldFitViewport={shouldFitSequenceMapViewport(params.sequenceViewport)}
                onViewportChange={params.onSequenceViewportChange}
                showRuntimeDetails={params.model.selectedRun !== null}
            />
        );
    }

    return <WorkflowTextTab sections={params.model.tabs.text.sections} />;
}

function renderWorkflowWorkspaceReadyState(params: {
    model: WorkflowVisualiserModel;
    workflowId: string;
    activeTab: WorkflowWorkspaceTabId;
    selectedRunSelection: string | null;
    selectedDetailId: string | null;
    sequenceViewport: WorkflowSequenceMapViewport | null;
    setPersistedTab: (tabId: WorkflowWorkspaceTabId) => void;
    setPersistedViewport: (viewport: WorkflowSequenceMapViewport) => void;
    setSelectedDetailId: (detailId: string | null) => void;
    setSelectedRunSelection: (runSelection: string | null) => void;
    onWorkflowIdChange: (workflowId: string) => void;
    retryAction: ReturnType<typeof useWorkflowRetryAction>;
}) {
    const supportsInspector = tabSupportsInspector(params.activeTab);
    const selectedDetail = getWorkflowDetail(params.model, params.selectedDetailId);

    return (
        <div className="mx-auto flex h-full w-full flex-col gap-5 overflow-y-auto bg-[#0a0a0a] p-6">
            <WorkflowWorkspaceHeader
                model={params.model}
                selectedWorkflowId={params.workflowId}
                onSelectWorkflow={(nextWorkflowId) => {
                    params.onWorkflowIdChange(nextWorkflowId);
                    params.setSelectedRunSelection(null);
                    params.setSelectedDetailId(null);
                }}
                activeTab={params.activeTab}
                onSelectTab={(nextTab) => {
                    params.setPersistedTab(nextTab);
                    if (!tabSupportsInspector(nextTab)) {
                        params.setSelectedDetailId(null);
                    }
                }}
                selectedRunValue={getWorkflowWorkspaceRunSelectionValue(params.selectedRunSelection, params.model.selectedRun?.runId ?? null)}
                onSelectRun={(runSelection) => {
                    params.setSelectedRunSelection(runSelection);
                    params.setSelectedDetailId(null);
                    if (!params.retryAction.retryingMissingAiMetadata) {
                        params.retryAction.clearResumeAssetCount();
                    }
                }}
                retryState={{
                    enabled: params.retryAction.canRetryMissingAiMetadata,
                    loading: params.retryAction.retryingMissingAiMetadata,
                    assetCount: params.retryAction.resumeAssetCount,
                    requestCompleted: params.retryAction.resumeRequestCompleted,
                    onRetry: params.retryAction.retryMissingAiMetadata,
                }}
            />

            <div className={`grid gap-5 ${supportsInspector ? 'xl:grid-cols-[1.5fr_0.65fr]' : 'xl:grid-cols-1'}`}>
                <div className="min-h-0">
                    <WorkflowWorkspaceContent
                        model={params.model}
                        activeTab={params.activeTab}
                        onSelectDetail={params.setSelectedDetailId}
                        sequenceViewport={params.sequenceViewport}
                        onSequenceViewportChange={params.setPersistedViewport}
                    />
                </div>

                {supportsInspector ? (
                    <WorkflowDetailPanel
                        detail={selectedDetail}
                        onClose={() => params.setSelectedDetailId(null)}
                        showRuntimeDetails={params.model.selectedRun !== null}
                    />
                ) : null}
            </div>
        </div>
    );
}

function ActiveWorkflowWorkspace({ workflowId, onWorkflowIdChange, onGetWorkflowVisualiser, onRerunMissingFolderAiMetadata }: WorkflowWorkspaceProps) {
    const [selectedRunSelection, setSelectedRunSelection] = useState<string | null>(null);
    const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
    const {
        activeTab,
        sequenceViewport,
        setPersistedTab,
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
        activeTab,
        selectedRunSelection,
        selectedDetailId,
        sequenceViewport,
        setPersistedTab,
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
