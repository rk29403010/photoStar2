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

export type WorkflowRuntimeOrchestratorDependencies = {
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
    private runGeneration = 0;
    private readonly activeRunIds = new Set<string>();
    private readonly runControllers = new Map<string, AbortController>();

    constructor(private readonly deps: WorkflowRuntimeOrchestratorDependencies) {
        this.telemetry = deps.telemetry ?? new WorkflowRuntimeTelemetry();
    }

    public invalidateRunningRuns(reason = 'Workflow runtime invalidated'): void {
        this.runGeneration += 1;
        for (const controller of this.runControllers.values()) {
            controller.abort(new Error(reason));
        }
        this.runControllers.clear();
        console.warn(`[Workflow] Invalidated in-flight runs: ${reason}`);
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

    public async waitForIdle(timeoutMs = 3000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (this.activeRunIds.size > 0) {
            if (Date.now() >= deadline) {
                throw new Error(`Timed out waiting for workflow runtime to become idle (${this.activeRunIds.size} run(s) still active).`);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }

    private async executeRun(runId: string, input: CreateWorkflowRunInput): Promise<void> {
        const runGeneration = this.runGeneration;
        const workflow = this.deps.workflows.get(input.workflowId);
        const orderedNodes = topologicallySortNodes(workflow.nodes);
        const controller = new AbortController();
        this.activeRunIds.add(runId);
        this.runControllers.set(runId, controller);

        this.telemetry.runStarted(runId, workflow.id);
        try {
            await this.executeWorkflowNodes(runId, workflow, orderedNodes, input.inputSubjects, input.parameters ?? {}, runGeneration, controller.signal);
            this.deps.store.updateWorkflowRunStatus(runId, 'completed');
            this.telemetry.runCompleted(runId, workflow.id);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.deps.store.updateWorkflowRunStatus(runId, 'failed');
            this.telemetry.runFailed(runId, workflow.id, errorMessage);
            throw error;
        } finally {
            this.activeRunIds.delete(runId);
            this.runControllers.delete(runId);
        }
    }

    private async executeWorkflowNodes(
        runId: string,
        workflow: { id: string } & WorkflowMilestonesPresentation,
        orderedNodes: WorkflowNodeDefinition[],
        inputSubjects: SubjectRef[],
        parameters: Record<string, unknown>,
        runGeneration: number,
        signal: AbortSignal,
    ): Promise<void> {
        const state = this.createExecutionState(orderedNodes);
        this.seedRootSubjects(state, inputSubjects);

        while (this.hasPendingWork(state)) {
            this.assertRunGeneration(runGeneration, runId);
            if (signal.aborted) {
                throw new Error(`workflow run '${runId}' cancelled`);
            }
            this.startReadyNodes(runId, workflow, parameters, runGeneration, state, signal);
            await this.waitForRunningTask(state);
        }

        await this.throwIfExecutionFailed(state);
    }

    private assertRunGeneration(expectedRunGeneration: number, runId: string): void {
        if (expectedRunGeneration === this.runGeneration) {
            return;
        }
        throw new Error(`workflow run '${runId}' cancelled: runtime reset`);
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
        runGeneration: number,
        state: WorkflowExecutionState,
        signal: AbortSignal,
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
                runGeneration,
                state,
                node,
                nodeId,
                signal,
            });
        }
    }

    private startNodeTask(params: {
        runId: string;
        workflow: WorkflowMilestonesPresentation;
        parameters: Record<string, unknown>;
        runGeneration: number;
        state: WorkflowExecutionState;
        node: WorkflowNodeDefinition;
        nodeId: string;
        signal: AbortSignal;
    }): void {
        const nodeSubjects = params.state.subjectsByNode.get(params.nodeId) ?? [];
        const task = this.executeScheduledNode({
            runId: params.runId,
            workflow: params.workflow,
            node: params.node,
            nodeSubjects,
            parameters: params.parameters,
            runGeneration: params.runGeneration,
            remainingUpstreamCounts: params.state.remainingUpstreamCounts,
            subjectsByNode: params.state.subjectsByNode,
            readyNodeIds: params.state.readyNodeIds,
            signal: params.signal,
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
        runGeneration: number;
        remainingUpstreamCounts: Map<string, number>;
        subjectsByNode: Map<string, SubjectRef[]>;
        readyNodeIds: string[];
        signal: AbortSignal;
    }): Promise<void> {
        this.assertRunGeneration(params.runGeneration, params.runId);
        
        let success: SubjectRef[] = [];
        let failure: SubjectRef[] = [];

        if (params.node.kind === 'control') {
            success = executeControlNode(params.node as WorkflowControlNodeDefinition, params.nodeSubjects);
        } else {
            const result = await this.executeModuleNode(
                params.runId,
                params.workflow,
                params.node as WorkflowModuleNodeDefinition,
                params.nodeSubjects,
                { ...params.parameters, ...(params.node as WorkflowModuleNodeDefinition).parameters },
                params.runGeneration,
                params.signal,
            );
            success = result.success;
            failure = result.failure;
        }

        this.assertRunGeneration(params.runGeneration, params.runId);

        this.queueReadyDownstreamNodes({
            targetIds: params.node.outputsTo ?? [],
            outputSubjects: success,
            remainingUpstreamCounts: params.remainingUpstreamCounts,
            subjectsByNode: params.subjectsByNode,
            readyNodeIds: params.readyNodeIds,
        });

        if (params.node.kind === 'module' && (params.node as WorkflowModuleNodeDefinition).onFailureTo) {
            this.queueReadyDownstreamNodes({
                targetIds: (params.node as WorkflowModuleNodeDefinition).onFailureTo ?? [],
                outputSubjects: failure,
                remainingUpstreamCounts: params.remainingUpstreamCounts,
                subjectsByNode: params.subjectsByNode,
                readyNodeIds: params.readyNodeIds,
            });
        }
    }

    private queueReadyDownstreamNodes(params: {
        targetIds: string[];
        outputSubjects: SubjectRef[];
        remainingUpstreamCounts: Map<string, number>;
        subjectsByNode: Map<string, SubjectRef[]>;
        readyNodeIds: string[];
    }): void {
        for (const targetId of params.targetIds) {
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
        runGeneration: number,
        signal: AbortSignal,
    ): Promise<{ success: SubjectRef[]; failure: SubjectRef[] }> {
        if (node.runMode === 'once_per_batch') {
            return this.executeBatchModuleNode(runId, workflow, node, subjects, parameters, runGeneration, signal);
        }

        return this.executePerSubjectModuleNode(runId, workflow, node, subjects, parameters, runGeneration, signal);
    }

    private async executePerSubjectModuleNode(
        runId: string,
        workflow: WorkflowMilestonesPresentation,
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
        runGeneration: number,
        signal: AbortSignal,
    ): Promise<{ success: SubjectRef[]; failure: SubjectRef[] }> {
        this.assertRunGeneration(runGeneration, runId);
        const stepRunId = this.deps.store.recordStepRun({
            workflowRunId: runId,
            nodeId: node.id,
            status: 'running',
            expectedItems: subjects.length,
        });
        this.telemetry.stepStarted(runId, node.id, subjects.length);
        const emittedSuccess: SubjectRef[] = [];
        const emittedFailure: SubjectRef[] = [];
        const successfulSubjects: SubjectRef[] = [];
        const failedSubjects: SubjectRef[] = [];
        let hasFailures = false;
        let lastErrorMessage: string | undefined;

        for (const subject of subjects) {
            this.assertRunGeneration(runGeneration, runId);
            if (signal.aborted) {
                throw new Error(`workflow step '${node.id}' cancelled`);
            }
            const result = await this.executePerSubjectStep(runId, stepRunId, node, subject, parameters, signal);
            if (result.error) {
                hasFailures = true;
                lastErrorMessage = result.error;
                failedSubjects.push(subject);
                // Currently we don't support modules emitting subjects on failure in the result structure, 
                // but we could extend handleTaskMode to return failed subjects if needed.
            } else {
                successfulSubjects.push(subject);
                if (result.emittedSubjects) {
                    emittedSuccess.push(...result.emittedSubjects);
                }
            }
        }

        this.assertRunGeneration(runGeneration, runId);
        this.updateCompletedMilestones(runId, workflow.presentation?.milestones ?? [], node.completesMilestones ?? []);
        
        this.recordStepCompletion({
            runId,
            stepRunId,
            nodeId: node.id,
            hasFailures,
            lastErrorMessage,
        });
        
        return {
            success: emittedSuccess.length > 0 ? emittedSuccess : successfulSubjects,
            failure: emittedFailure.length > 0 ? emittedFailure : failedSubjects,
        };
    }

    private recordStepCompletion(params: {
        runId: string;
        stepRunId: string;
        nodeId: string;
        hasFailures: boolean;
        lastErrorMessage?: string;
    }): void {
        if (params.hasFailures) {
            this.deps.store.recordStepRun({
                stepRunId: params.stepRunId,
                workflowRunId: params.runId,
                nodeId: params.nodeId,
                status: 'failed',
                errorMessage: params.lastErrorMessage,
            });
            this.telemetry.stepFailed(params.runId, params.nodeId, params.lastErrorMessage);
            this.deps.store.updateWorkflowRunStatus(params.runId, 'failed');
        } else {
            this.deps.store.recordStepRun({
                stepRunId: params.stepRunId,
                workflowRunId: params.runId,
                nodeId: params.nodeId,
                status: 'completed',
            });
            this.telemetry.stepCompleted(params.runId, params.nodeId);
        }
    }

    private async executePerSubjectStep(
        runId: string,
        stepRunId: string,
        node: WorkflowModuleNodeDefinition,
        subject: SubjectRef,
        parameters: Record<string, unknown>,
        signal: AbortSignal,
    ): Promise<{ emittedSubjects?: SubjectRef[]; error?: string }> {
        this.telemetry.subjectStarted(runId, node.id, subject.subjectType, subject.subjectId);
        const module = this.deps.modules.get(node.moduleId);
        try {
            const result = await module.run({ runId, subject, batchSubjects: [subject], parameters, signal });
            this.deps.store.recordSubjectExecution({
                workflowRunId: runId,
                stepRunId,
                subjectType: subject.subjectType,
                subjectId: subject.subjectId,
                status: 'completed',
            });
            this.telemetry.subjectCompleted(runId, node.id, subject.subjectType, subject.subjectId);
            return { emittedSubjects: result.emittedSubjects };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Workflow] Subject ${subject.subjectType}:${subject.subjectId} failed in node ${node.id}: ${errorMessage}`);
            this.deps.store.recordSubjectExecution({
                workflowRunId: runId,
                stepRunId,
                subjectType: subject.subjectType,
                subjectId: subject.subjectId,
                status: 'failed',
            });
            this.telemetry.subjectFailed(runId, node.id, subject.subjectType, subject.subjectId, errorMessage);
            return { error: errorMessage };
        }
    }

    private async executeBatchModuleNode(
        runId: string,
        workflow: WorkflowMilestonesPresentation,
        node: WorkflowModuleNodeDefinition,
        subjects: SubjectRef[],
        parameters: Record<string, unknown>,
        runGeneration: number,
        signal: AbortSignal,
    ): Promise<{ success: SubjectRef[]; failure: SubjectRef[] }> {
        this.assertRunGeneration(runGeneration, runId);
        const stepRunId = this.deps.store.recordStepRun({
            workflowRunId: runId,
            nodeId: node.id,
            status: 'running',
            expectedItems: subjects.length,
        });
        this.telemetry.stepStarted(runId, node.id, subjects.length);
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
                signal,
            });
            this.assertRunGeneration(runGeneration, runId);
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
            this.telemetry.stepCompleted(runId, node.id);
            
            const success = result.emittedSubjects && result.emittedSubjects.length > 0 ? result.emittedSubjects : subjects;
            return { success, failure: [] };
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
            this.telemetry.stepFailed(runId, node.id, errorMessage);
            this.deps.store.updateWorkflowRunStatus(runId, 'failed');
            
            return { success: [], failure: subjects };
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
