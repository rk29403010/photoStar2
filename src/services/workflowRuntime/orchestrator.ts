import { executeControlNode } from './controlNodes';
import type {
    WorkflowControlNodeDefinition,
    WorkflowModuleNodeDefinition,
    WorkflowNodeDefinition,
} from './contracts';
import type { CreateWorkflowRunInput, ExecutionStore, SubjectRef } from './executionStore';
import type { ModuleRegistry } from './moduleRegistry';
import { WorkflowRuntimeTelemetry } from './telemetry';
import type { WorkflowRegistry } from './workflowRegistry';

export interface WorkflowRuntimeOrchestratorDependencies {
    store: ExecutionStore;
    workflows: WorkflowRegistry;
    modules: ModuleRegistry;
    telemetry?: WorkflowRuntimeTelemetry;
}

function createNodeMap(nodes: WorkflowNodeDefinition[]): Map<string, WorkflowNodeDefinition> {
    return new Map(nodes.map((node) => [node.id, node]));
}

function createIndegreeMap(nodes: WorkflowNodeDefinition[]): Map<string, number> {
    return new Map<string, number>(nodes.map((node) => [node.id, 0]));
}

function populateIndegreeMap(nodes: WorkflowNodeDefinition[], indegree: Map<string, number>): void {
    for (const node of nodes) {
        for (const targetId of node.outputsTo || []) {
            indegree.set(targetId, (indegree.get(targetId) || 0) + 1);
        }
    }
}

function createRootQueue(nodes: WorkflowNodeDefinition[], indegree: Map<string, number>): string[] {
    return nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
}

function drainQueue(
    queue: string[],
    byId: Map<string, WorkflowNodeDefinition>,
    indegree: Map<string, number>,
): WorkflowNodeDefinition[] {
    const ordered: WorkflowNodeDefinition[] = [];
    while (queue.length > 0) {
        const nodeId = queue.shift();
        if (!nodeId) {
            continue;
        }
        const node = byId.get(nodeId);
        if (!node) {
            continue;
        }
        ordered.push(node);
        for (const targetId of node.outputsTo || []) {
            const nextIndegree = (indegree.get(targetId) || 0) - 1;
            indegree.set(targetId, nextIndegree);
            if (nextIndegree === 0) {
                queue.push(targetId);
            }
        }
    }
    return ordered;
}

function topologicallySortNodes(nodes: WorkflowNodeDefinition[]): WorkflowNodeDefinition[] {
    const byId = createNodeMap(nodes);
    const indegree = createIndegreeMap(nodes);
    populateIndegreeMap(nodes, indegree);
    return drainQueue(createRootQueue(nodes, indegree), byId, indegree);
}

export class WorkflowRuntimeOrchestrator {
    private readonly telemetry: WorkflowRuntimeTelemetry;

    constructor(private readonly deps: WorkflowRuntimeOrchestratorDependencies) {
        this.telemetry = deps.telemetry ?? new WorkflowRuntimeTelemetry();
    }

    public async start(input: CreateWorkflowRunInput): Promise<string> {
        const workflow = this.deps.workflows.get(input.workflowId);
        const runId = this.deps.store.createWorkflowRun(input);
        let activeSubjects: SubjectRef[] = [...input.inputSubjects];

        this.telemetry.runStarted(runId, workflow.id);

        for (const node of topologicallySortNodes(workflow.nodes)) {
            if (node.kind === 'control') {
                activeSubjects = executeControlNode(node as WorkflowControlNodeDefinition, activeSubjects);
                continue;
            }

            activeSubjects = await this.executeModuleNode(
                runId,
                workflow,
                node as WorkflowModuleNodeDefinition,
                activeSubjects,
                input.parameters ?? {},
            );
        }

        this.deps.store.updateWorkflowRunStatus(runId, 'completed');
        this.telemetry.runCompleted(runId, workflow.id);
        return runId;
    }

    private async executeModuleNode(
        runId: string,
        workflow: { presentation?: { milestones: Array<{ id: string; label: string }> } },
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
    ): Promise<SubjectRef[]> {
        if (node.runMode === 'once_per_batch') {
            return this.executeBatchModuleNode(runId, workflow, node, subjects, parameters);
        }

        return this.executePerSubjectModuleNode(runId, workflow, node, subjects, parameters);
    }

    private async executePerSubjectModuleNode(
        runId: string,
        workflow: { presentation?: { milestones: Array<{ id: string; label: string }> } },
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
    ): Promise<SubjectRef[]> {
        const stepRunId = this.deps.store.recordStepRun({
            workflowRunId: runId,
            nodeId: node.id,
            status: 'running',
        });
        const module = this.deps.modules.get(node.moduleId);
        const emittedSubjects: SubjectRef[] = [];

        for (const subject of subjects) {
            try {
                const result = await module.run({ runId, subject, batchSubjects: [subject], parameters });
                for (const emittedSubject of result.emittedSubjects ?? []) {
                    emittedSubjects.push(emittedSubject);
                }
                this.deps.store.recordSubjectExecution({
                    workflowRunId: runId,
                    stepRunId,
                    subjectType: subject.subjectType,
                    subjectId: subject.subjectId,
                    status: 'completed',
                });
            } catch {
                this.deps.store.recordSubjectExecution({
                    workflowRunId: runId,
                    stepRunId,
                    subjectType: subject.subjectType,
                    subjectId: subject.subjectId,
                    status: 'failed',
                });
                this.deps.store.recordStepRun({
                    stepRunId,
                    workflowRunId: runId,
                    nodeId: node.id,
                    status: 'failed',
                });
                this.deps.store.updateWorkflowRunStatus(runId, 'failed');
                throw new Error(`workflow step '${node.id}' failed`);
            }
        }

        this.updateCompletedMilestones(runId, workflow.presentation?.milestones ?? [], node.completesMilestones ?? []);
        this.deps.store.recordStepRun({
            stepRunId,
            workflowRunId: runId,
            nodeId: node.id,
            status: 'completed',
        });
        return emittedSubjects.length > 0 ? emittedSubjects : subjects;
    }

    private async executeBatchModuleNode(
        runId: string,
        workflow: { presentation?: { milestones: Array<{ id: string; label: string }> } },
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
    ): Promise<SubjectRef[]> {
        const stepRunId = this.deps.store.recordStepRun({
            workflowRunId: runId,
            nodeId: node.id,
            status: 'running',
        });
        const module = this.deps.modules.get(node.moduleId);
        const primarySubject = subjects[0] ?? {
            subjectType: 'batch',
            subjectId: `${runId}:${node.id}`,
        };

        try {
            const result = await module.run({
                runId,
                subject: primarySubject,
                batchSubjects: subjects,
                parameters,
            });
            this.deps.store.recordSubjectExecution({
                workflowRunId: runId,
                stepRunId,
                subjectType: primarySubject.subjectType,
                subjectId: primarySubject.subjectId,
                status: 'completed',
            });
            this.updateCompletedMilestones(runId, workflow.presentation?.milestones ?? [], node.completesMilestones ?? []);
            this.deps.store.recordStepRun({
                stepRunId,
                workflowRunId: runId,
                nodeId: node.id,
                status: 'completed',
            });
            return result.emittedSubjects && result.emittedSubjects.length > 0 ? result.emittedSubjects : subjects;
        } catch {
            this.deps.store.recordSubjectExecution({
                workflowRunId: runId,
                stepRunId,
                subjectType: primarySubject.subjectType,
                subjectId: primarySubject.subjectId,
                status: 'failed',
            });
            this.deps.store.recordStepRun({
                stepRunId,
                workflowRunId: runId,
                nodeId: node.id,
                status: 'failed',
            });
            this.deps.store.updateWorkflowRunStatus(runId, 'failed');
            throw new Error(`workflow step '${node.id}' failed`);
        }
    }

    private updateCompletedMilestones(
        runId: string,
        milestones: Array<{ id: string; label: string }>,
        completedMilestoneIds: string[],
    ): void {
        for (const milestoneId of completedMilestoneIds) {
            const milestone = milestones.find((candidate) => candidate.id === milestoneId);
            if (!milestone) {
                continue;
            }
            this.deps.store.updateMilestoneState(runId, {
                milestoneId: milestone.id,
                label: milestone.label,
                status: 'completed',
            });
        }
    }
}
