import { useEffect, useState } from 'react';
import type { WorkflowModuleRepositoryModel, WorkflowModuleRepositoryModule } from '@contracts/workflowVisualiser';

type ModuleMaintenanceWorkspaceProps = {
    readonly onGetModuleRepository: () => Promise<WorkflowModuleRepositoryModel>;
    readonly onSelectWorkflow: (workflowId: string) => void;
}

function formatOutputs(module: WorkflowModuleRepositoryModule): string {
    if (module.outputs.length === 0) {
        return 'None';
    }
    return module.outputs.map((output) => `${output.artifactType} (${output.subjectType})`).join(', ');
}

function PropertyRow(props: { readonly label: string; readonly value: string }) {
    return (
        <div className="border-b border-content/10 py-3 last:border-b-0">
            <dt className="text-xs font-semibold uppercase tracking-wider text-content-secondary">{props.label}</dt>
            <dd className="mt-1 break-words text-sm text-content">{props.value}</dd>
        </div>
    );
}

function ModuleProperties({ module, onSelectWorkflow }: {
    readonly module: WorkflowModuleRepositoryModule;
    readonly onSelectWorkflow: (workflowId: string) => void;
}) {
    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
            <div className="max-w-3xl">
                <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">Module repository</div>
                <h2 className="mt-2 text-2xl font-semibold text-content">{module.displayName}</h2>
                <p className="mt-2 text-sm leading-6 text-content-secondary">{module.description}</p>

                <dl className="mt-6 rounded-xl border border-content/10 bg-surface-secondary px-4">
                    <PropertyRow label="ID" value={module.id} />
                    <PropertyRow label="Contract version" value={String(module.contractVersion)} />
                    <PropertyRow label="Inputs" value={module.inputs.join(', ') || 'None'} />
                    <PropertyRow label="Outputs" value={formatOutputs(module)} />
                    <PropertyRow label="Capabilities" value={module.capabilities.join(', ')} />
                    <PropertyRow label="Milestones" value={module.milestones.map((milestone) => `${milestone.label} (${milestone.id})`).join(', ') || 'None'} />
                    <PropertyRow label="Error kinds" value={module.errorKinds.join(', ') || 'None'} />
                    <PropertyRow label="Fixtures" value={module.fixtures.join(', ') || 'None'} />
                </dl>

                <section className="mt-6">
                    <h3 className="text-sm font-semibold text-content">Used by workflows</h3>
                    {module.workflows.length === 0 ? (
                        <p className="mt-2 text-sm text-content-secondary">This module is not used by a registered workflow.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-content/10 rounded-xl border border-content/10 bg-surface-secondary">
                            {module.workflows.map((workflow) => (
                                <li key={workflow.workflowId}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectWorkflow(workflow.workflowId)}
                                        className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-surface"
                                    >
                                        <span className="text-sm font-medium text-brand-accent">{workflow.displayName}</span>
                                        <span className="font-mono text-xs text-content-secondary">{workflow.workflowId}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </section>
    );
}

function useModuleRepository(onGetModuleRepository: ModuleMaintenanceWorkspaceProps['onGetModuleRepository']) {
    const [model, setModel] = useState<WorkflowModuleRepositoryModel | null>(null);
    const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void onGetModuleRepository()
            .then((nextModel) => {
                if (cancelled) {return;}
                setModel(nextModel);
                setSelectedModuleId((current) => current ?? nextModel.modules[0]?.id ?? null);
            })
            .catch((nextError: unknown) => {
                if (!cancelled) {
                    setError(String(nextError));
                }
            });
        return () => { cancelled = true; };
    }, [onGetModuleRepository]);

    return { model, selectedModuleId, setSelectedModuleId, error };
}

function renderModuleMaintenanceState(params: {
    model: WorkflowModuleRepositoryModel | null;
    selectedModuleId: string | null;
    setSelectedModuleId: (moduleId: string) => void;
    error: string | null;
    onSelectWorkflow: ModuleMaintenanceWorkspaceProps['onSelectWorkflow'];
}) {
    const { model, selectedModuleId, setSelectedModuleId, error, onSelectWorkflow } = params;

    if (error) {
        return <div className="flex h-full items-center justify-center text-sm text-red-400">{error}</div>;
    }

    if (!model) {
        return <div className="flex h-full items-center justify-center text-sm text-content-secondary">Loading module repository...</div>;
    }

    const selectedModule = model.modules.find((module) => module.id === selectedModuleId) ?? null;
    return (
        <div className="flex h-full min-h-0 bg-surface text-content">
            <aside className="flex w-80 flex-col border-r border-content/10 bg-surface-secondary">
                <div className="border-b border-content/10 p-4">
                    <h1 className="text-lg font-semibold text-content">Module Maintenance</h1>
                    <p className="mt-1 text-sm text-content-secondary">{model.modules.length} registered modules</p>
                </div>
                <nav aria-label="Workflow modules" className="min-h-0 overflow-y-auto p-2">
                    {model.modules.map((module) => (
                        <button
                            type="button"
                            key={module.id}
                            aria-current={selectedModule?.id === module.id ? 'page' : undefined}
                            onClick={() => setSelectedModuleId(module.id)}
                            className={`mb-1 flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors ${selectedModule?.id === module.id ? 'bg-brand-accent text-white' : 'text-content hover:bg-surface'}`}
                        >
                            <span className="text-sm font-medium">{module.displayName}</span>
                            <span className="font-mono text-xs opacity-70">{module.id}</span>
                        </button>
                    ))}
                </nav>
            </aside>
            {selectedModule ? <ModuleProperties module={selectedModule} onSelectWorkflow={onSelectWorkflow} /> : null}
        </div>
    );
}

export function ModuleMaintenanceWorkspace({ onGetModuleRepository, onSelectWorkflow }: ModuleMaintenanceWorkspaceProps) {
    const repository = useModuleRepository(onGetModuleRepository);
    return renderModuleMaintenanceState({ ...repository, onSelectWorkflow });
}
