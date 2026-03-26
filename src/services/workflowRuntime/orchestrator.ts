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

type WorkflowMilestonesPresentation = { presentation?: { milestones: Array<{ id: string; label: string }> } };

type WorkflowExecutionState = {
    nodeById: Map<string, WorkflowNodeDefinition>;
    remainingUpstreamCounts: Map<string, number>;
    subjectsByNode: Map<string, SubjectRef[]>;
    readyNodeIds: string[];
    runningTasks: Map<string, Promise<void>>;
    failure: Error | null;
};

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

function createEmptySubjectMap(nodes: WorkflowNodeDefinition[]): Map<string, SubjectRef[]> {
    return new Map(nodes.map((node) => [node.id, []]));
}

function cloneSubjects(subjects: SubjectRef[]): SubjectRef[] {
    return subjects.map((subject) => ({ ...subject }));
}

function mergeSubjects(existing: SubjectRef[], incoming: SubjectRef[]): SubjectRef[] {
    if (incoming.length === 0) {
        return existing;
    }

    const merged = [...existing];
    const seen = new Set(existing.map((subject) => `${subject.subjectType}:${subject.subjectId}`));

    for (const subject of incoming) {
        const key = `${subject.subjectType}:${subject.subjectId}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        merged.push(subject);
    }

    return merged;
}

export class WorkflowRuntimeOrchestrator {
    private readonly telemetry: WorkflowRuntimeTelemetry;

    constructor(private readonly deps: WorkflowRuntimeOrchestratorDependencies) {
        this.telemetry = deps.telemetry ?? new WorkflowRuntimeTelemetry();
    }

    public async start(input: CreateWorkflowRunInput): Promise<string> {
        const runId = this.deps.store.createWorkflowRun(input);
        await this.executeRun(runId, input);
        return runId;
    }

    public startDetached(input: CreateWorkflowRunInput): string {
        const runId = this.deps.store.createWorkflowRun(input);
        void this.executeRun(runId, input).catch((error) => {
            console.error(`Workflow run '${runId}' failed:`, error);
        });
        return runId;
    }

    private async executeRun(runId: string, input: CreateWorkflowRunInput): Promise<void> {
        const workflow = this.deps.workflows.get(input.workflowId);
        const orderedNodes = topologicallySortNodes(workflow.nodes);

        this.telemetry.runStarted(runId, workflow.id);
        await this.executeWorkflowNodes(runId, workflow, orderedNodes, input.inputSubjects, input.parameters ?? {});
        this.deps.store.updateWorkflowRunStatus(runId, 'completed');
        this.telemetry.runCompleted(runId, workflow.id);
    }

    private async executeWorkflowNodes(
        runId: string,
        workflow: { id: string } & WorkflowMilestonesPresentation,
        orderedNodes: WorkflowNodeDefinition[],
        inputSubjects: SubjectRef[],
        parameters: Record<string, unknown>,
    ): Promise<void> {
        const state = this.createExecutionState(orderedNodes);
        this.seedRootSubjects(state, inputSubjects);

        while (this.hasPendingWork(state)) {
            this.startReadyNodes(runId, workflow, parameters, state);
            await this.waitForRunningTask(state);
        }

        await this.throwIfExecutionFailed(state);
    }

    private createExecutionState(orderedNodes: WorkflowNodeDefinition[]): WorkflowExecutionState {
        const remainingUpstreamCounts = createIndegreeMap(orderedNodes);
        populateIndegreeMap(orderedNodes, remainingUpstreamCounts);

        return {
            nodeById: createNodeMap(orderedNodes),
            remainingUpstreamCounts,
            subjectsByNode: createEmptySubjectMap(orderedNodes),
            readyNodeIds: createRootQueue(orderedNodes, remainingUpstreamCounts),
            runningTasks: new Map<string, Promise<void>>(),
            failure: null,
        };
    }

    private seedRootSubjects(state: WorkflowExecutionState, inputSubjects: SubjectRef[]): void {
        for (const nodeId of state.readyNodeIds) {
            state.subjectsByNode.set(nodeId, cloneSubjects(inputSubjects));
        }
    }

    private hasPendingWork(state: WorkflowExecutionState): boolean {
        if (state.failure) {
            return state.runningTasks.size > 0;
        }
        return state.readyNodeIds.length > 0 || state.runningTasks.size > 0;
    }

    private startReadyNodes(
        runId: string,
        workflow: WorkflowMilestonesPresentation,
        parameters: Record<string, unknown>,
        state: WorkflowExecutionState,
    ): void {
        while (state.readyNodeIds.length > 0) {
            if (state.failure) {
                return;
            }

            const nodeId = state.readyNodeIds.shift();
            if (!nodeId) {
                continue;
            }

            const node = state.nodeById.get(nodeId);
            if (!node) {
                continue;
            }

            this.startNodeTask({
                runId,
                workflow,
                parameters,
                state,
                node,
                nodeId,
            });
        }
    }

    private startNodeTask(params: {
        runId: string;
        workflow: WorkflowMilestonesPresentation;
        parameters: Record<string, unknown>;
        state: WorkflowExecutionState;
        node: WorkflowNodeDefinition;
        nodeId: string;
    }): void {
        const nodeSubjects = params.state.subjectsByNode.get(params.nodeId) ?? [];
        const task = this.executeScheduledNode({
            runId: params.runId,
            workflow: params.workflow,
            node: params.node,
            nodeSubjects,
            parameters: params.parameters,
            remainingUpstreamCounts: params.state.remainingUpstreamCounts,
            subjectsByNode: params.state.subjectsByNode,
            readyNodeIds: params.state.readyNodeIds,
        }).catch((error) => {
            if (!params.state.failure) {
                params.state.failure = error instanceof Error ? error : new Error(String(error));
            }
        }).finally(() => {
            params.state.runningTasks.delete(params.nodeId);
        });

        params.state.runningTasks.set(params.nodeId, task);
    }

    private async waitForRunningTask(state: WorkflowExecutionState): Promise<void> {
        if (state.runningTasks.size === 0) {
            return;
        }

        await Promise.race(state.runningTasks.values());
    }

    private async throwIfExecutionFailed(state: WorkflowExecutionState): Promise<void> {
        if (!state.failure) {
            return;
        }

        await Promise.allSettled(state.runningTasks.values());
        throw state.failure;
    }

    private async executeScheduledNode(params: {
        runId: string;
        workflow: WorkflowMilestonesPresentation;
        node: WorkflowNodeDefinition;
        nodeSubjects: SubjectRef[];
        parameters: Record<string, unknown>;
        remainingUpstreamCounts: Map<string, number>;
        subjectsByNode: Map<string, SubjectRef[]>;
        readyNodeIds: string[];
    }): Promise<void> {
        const outputSubjects = params.node.kind === 'control'
            ? executeControlNode(params.node as WorkflowControlNodeDefinition, params.nodeSubjects)
            : await this.executeModuleNode(
                params.runId,
                params.workflow,
                params.node as WorkflowModuleNodeDefinition,
                params.nodeSubjects,
                params.parameters,
            );

        this.queueReadyDownstreamNodes({
            node: params.node,
            outputSubjects,
            remainingUpstreamCounts: params.remainingUpstreamCounts,
            subjectsByNode: params.subjectsByNode,
            readyNodeIds: params.readyNodeIds,
        });
    }

    private queueReadyDownstreamNodes(params: {
        node: WorkflowNodeDefinition;
        outputSubjects: SubjectRef[];
        remainingUpstreamCounts: Map<string, number>;
        subjectsByNode: Map<string, SubjectRef[]>;
        readyNodeIds: string[];
    }): void {
        for (const targetId of params.node.outputsTo ?? []) {
            const nextCount = (params.remainingUpstreamCounts.get(targetId) || 0) - 1;
            params.remainingUpstreamCounts.set(targetId, nextCount);
            const existingSubjects = params.subjectsByNode.get(targetId) ?? [];
            params.subjectsByNode.set(targetId, mergeSubjects(existingSubjects, params.outputSubjects));

            if (nextCount !== 0) {
                continue;
            }
            params.readyNodeIds.push(targetId);
        }
    }

    private async executeModuleNode(
        runId: string,
        workflow: WorkflowMilestonesPresentation,
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
        workflow: WorkflowMilestonesPresentation,
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
    ): Promise<SubjectRef[]> {
        const stepRunId = this.deps.store.recordStepRun({
            workflowRunId: runId,
            nodeId: node.id,
            status: 'running',
            expectedItems: subjects.length,
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
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
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
                    errorMessage,
                });
                this.deps.store.updateWorkflowRunStatus(runId, 'failed');
                throw new Error(`workflow step '${node.id}' failed: ${errorMessage}`);
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
        workflow: WorkflowMilestonesPresentation,
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
    ): Promise<SubjectRef[]> {
        const stepRunId = this.deps.store.recordStepRun({
            workflowRunId: runId,
            nodeId: node.id,
            status: 'running',
            expectedItems: subjects.length,
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
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
                errorMessage,
            });
            this.deps.store.updateWorkflowRunStatus(runId, 'failed');
            throw new Error(`workflow step '${node.id}' failed: ${errorMessage}`);
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
