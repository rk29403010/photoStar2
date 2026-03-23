import { useEffect, useState } from 'react';
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
    getWorkflowVisualiserRequestedRunId,
    getWorkflowWorkspaceRunSelectionValue,
    shouldFitSequenceMapViewport,
    tabSupportsInspector,
    type WorkflowSequenceMapViewport,
    type WorkflowWorkspaceTabId,
} from './workflowWorkspaceModel';

interface WorkflowWorkspaceProps {
    workflowId: string;
    onGetWorkflowVisualiser: (workflowId: string, runId?: string | null) => Promise<WorkflowVisualiserModel>;
}

function useWorkflowWorkspacePersistence(workflowId: string) {
    const [persistedTabs, setPersistedTabs] = usePersistedState<Record<string, WorkflowWorkspaceTabId>>('ps_workflow_workspace_tabs', {});
    const [persistedViewports, setPersistedViewports] = usePersistedState<Record<string, WorkflowSequenceMapViewport | null>>('ps_workflow_sequence_viewports', {});
    const [activeTab, setActiveTab] = useState<WorkflowWorkspaceTabId>(() => persistedTabs[workflowId] ?? getDefaultWorkflowWorkspaceTab());
    const [sequenceViewport, setSequenceViewport] = useState<WorkflowSequenceMapViewport | null>(() => persistedViewports[workflowId] ?? null);

    useEffect(() => {
        setActiveTab(persistedTabs[workflowId] ?? getDefaultWorkflowWorkspaceTab());
        setSequenceViewport(persistedViewports[workflowId] ?? null);
    }, [persistedTabs, persistedViewports, workflowId]);

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

function useWorkflowWorkspaceData(
    workflowId: string,
    selectedRunId: string | null,
    onGetWorkflowVisualiser: WorkflowWorkspaceProps['onGetWorkflowVisualiser'],
) {
    const [model, setModel] = useState<WorkflowVisualiserModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        void onGetWorkflowVisualiser(workflowId, selectedRunId)
            .then((nextModel) => {
                if (cancelled) {return;}
                setModel(nextModel);
            })
            .catch((nextError: unknown) => {
                if (cancelled) {return;}
                setError(String(nextError));
            })
            .finally(() => {
                if (cancelled) {return;}
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [onGetWorkflowVisualiser, selectedRunId, workflowId]);

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

export function WorkflowWorkspace({ workflowId, onGetWorkflowVisualiser }: WorkflowWorkspaceProps) {
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

    useEffect(() => {
        setSelectedDetailId(null);
    }, [workflowId]);

    if (loading) {
        return renderWorkflowWorkspaceState('Loading workflow visualiser...', 'idle');
    }

    if (error || !model) {
        return renderWorkflowWorkspaceState(error ?? 'Workflow visualiser unavailable.', 'error');
    }

    const supportsInspector = tabSupportsInspector(activeTab);
    const selectedDetail = getWorkflowDetail(model, selectedDetailId);

    return (
        <div className="mx-auto flex h-full w-full flex-col gap-5 overflow-y-auto bg-[#0a0a0a] p-6">
            <WorkflowWorkspaceHeader
                model={model}
                activeTab={activeTab}
                onSelectTab={(nextTab) => {
                    setPersistedTab(nextTab);
                    if (!tabSupportsInspector(nextTab)) {
                        setSelectedDetailId(null);
                    }
                }}
                selectedRunValue={getWorkflowWorkspaceRunSelectionValue(selectedRunSelection, model.selectedRun?.runId ?? null)}
                onSelectRun={(runSelection) => {
                    setSelectedRunSelection(runSelection);
                    setSelectedDetailId(null);
                }}
            />

            <div className={`grid gap-5 ${supportsInspector ? 'xl:grid-cols-[1.5fr_0.65fr]' : 'xl:grid-cols-1'}`}>
                <div className="min-h-0">
                    <WorkflowWorkspaceContent
                        model={model}
                        activeTab={activeTab}
                        onSelectDetail={setSelectedDetailId}
                        sequenceViewport={sequenceViewport}
                        onSequenceViewportChange={setPersistedViewport}
                    />
                </div>

                {supportsInspector ? (
                    <WorkflowDetailPanel
                        detail={selectedDetail}
                        onClose={() => setSelectedDetailId(null)}
                        showRuntimeDetails={model.selectedRun !== null}
                    />
                ) : null}
            </div>
        </div>
    );
}
