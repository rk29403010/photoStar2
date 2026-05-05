import type { WorkflowDefinition } from './contracts';
import { validateWorkflowDefinition } from './contracts';
import type { ModuleRegistry } from './moduleRegistry';
import type { SubjectRegistry } from './subjectRegistry';

export type WorkflowRegistryDependencies = {
    subjects: SubjectRegistry;
    modules: ModuleRegistry;
}

export class WorkflowRegistry {
    private readonly workflows = new Map<string, WorkflowDefinition>();

    constructor(private readonly deps: WorkflowRegistryDependencies) {}

    public register(definition: WorkflowDefinition): void {
        validateWorkflowDefinition(definition);
        if (this.workflows.has(definition.id)) {
            throw new Error(`duplicate workflow '${definition.id}'`);
        }
        for (const subjectTypeId of definition.inputs) {
            if (!this.deps.subjects.has(subjectTypeId)) {
                throw new Error(`unknown subject type '${subjectTypeId}'`);
            }
        }
        for (const node of definition.nodes) {
            if (node.kind !== 'module') {
                continue;
            }
            if (!this.deps.modules.has(node.moduleId)) {
                throw new Error(`unknown module '${node.moduleId}'`);
            }
        }
        this.workflows.set(definition.id, definition);
    }

    public get(workflowId: string): WorkflowDefinition {
        const definition = this.workflows.get(workflowId);
        if (!definition) {
            throw new Error(`unknown workflow '${workflowId}'`);
        }
        return definition;
    }

    public list(): WorkflowDefinition[] {
        return [...this.workflows.values()];
    }
}
