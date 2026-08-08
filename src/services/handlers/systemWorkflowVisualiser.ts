import type { WorkflowRunListItem } from '@contracts/jobs';
import type {
    WorkflowVisualiserAggregateCount,
    WorkflowVisualiserCounts,
    WorkflowVisualiserCountNoun,
    WorkflowVisualiserDetail,
    WorkflowVisualiserGraphEdge,
    WorkflowVisualiserGraphNode,
    WorkflowVisualiserLinkedRun,
    WorkflowVisualiserModel,
    WorkflowVisualiserProgressionStage,
    WorkflowVisualiserRunSummary,
    WorkflowVisualiserStatus,
    WorkflowVisualiserWorkflowSummary,
    WorkflowVisualiserTextSection,
    WorkflowModuleRepositoryModel,
    WorkflowModuleRepositoryModule,
} from '@contracts/workflowVisualiser';
import type { WorkflowDefinition, ModuleDefinition, WorkflowModulePluginManifest } from '../workflowRuntime/contracts';
import type { WorkflowFailedSubject, WorkflowRunDetail } from '../workflowRuntime/executionStore';
import { getWorkflowRunsSnapshot } from './systemWorkflowRunSnapshot';

type BuildWorkflowVisualiserParams = {
    workflowDefinition: WorkflowDefinition;
    availableWorkflows: WorkflowVisualiserWorkflowSummary[];
    runDetail: WorkflowRunDetail | null;
    availableRuns: WorkflowRunListItem[];
    allRuns: WorkflowRunListItem[];
};

type DbLike = Parameters<typeof getWorkflowRunsSnapshot>[0];

const DEFAULT_WORKFLOW_DESCRIPTION = 'Runtime-native workflow definition with optional live run overlay.';
const DEFAULT_COUNT_NOUN: WorkflowVisualiserCountNoun = { singular: 'item', plural: 'items' };

function toTitleCase(value: string): string {
    return value
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function toVisualiserStatus(value: string | undefined): WorkflowVisualiserStatus {
    if (value === 'running') {
        return 'running';
    }
    if (value === 'completed') {
        return 'completed';
    }
    if (value === 'failed') {
        return 'failed';
    }
    return 'idle';
}

function createNodeCounts(totalItems = 0, completedItems = 0, failedItems = 0): WorkflowVisualiserCounts {
    return { totalItems, completedItems, failedItems };
}

function getCountNoun(definition: WorkflowDefinition, nodeId: string): WorkflowVisualiserCountNoun {
    const node = definition.nodes.find((candidate) => candidate.id === nodeId);
    return node?.presentation?.countNoun ?? DEFAULT_COUNT_NOUN;
}

function getNodeLabel(definition: WorkflowDefinition, nodeId: string): string {
    const node = definition.nodes.find((candidate) => candidate.id === nodeId);
    return node?.presentation?.label ?? toTitleCase(nodeId);
}

function mergeAggregateCounts(
    existing: WorkflowVisualiserAggregateCount | undefined,
    nextCounts: WorkflowVisualiserCounts,
    noun: WorkflowVisualiserCountNoun,
): WorkflowVisualiserAggregateCount {
    if (!existing) {
        return { noun, ...nextCounts };
    }

    return {
        noun,
        totalItems: Math.max(existing.totalItems, nextCounts.totalItems),
        completedItems: Math.max(existing.completedItems, nextCounts.completedItems),
        failedItems: Math.max(existing.failedItems, nextCounts.failedItems),
    };
}

function buildAggregateCounts(definition: WorkflowDefinition, nodeIds: string[], runDetail: WorkflowRunDetail | null): WorkflowVisualiserAggregateCount[] {
    const countsByNoun = new Map<string, WorkflowVisualiserAggregateCount>();

    for (const nodeId of nodeIds) {
        const noun = getCountNoun(definition, nodeId);
        const nounKey = `${noun.singular}:${noun.plural}`;
        const nodeCounts = getStepCounts(runDetail, nodeId);
        countsByNoun.set(nounKey, mergeAggregateCounts(countsByNoun.get(nounKey), nodeCounts, noun));
    }

    return [...countsByNoun.values()];
}

function getStepCounts(runDetail: WorkflowRunDetail | null, nodeId: string): WorkflowVisualiserCounts {
    const step = runDetail?.steps.find((candidate) => candidate.nodeId === nodeId);
    if (!step) {
        return createNodeCounts();
    }
    return createNodeCounts(step.totalItems, step.completedItems, step.failedItems);
}

function getStepErrorMessage(runDetail: WorkflowRunDetail | null, nodeId: string): string | undefined {
    return runDetail?.steps.find((candidate) => candidate.nodeId === nodeId)?.errorMessage;
}

function getStepStatus(runDetail: WorkflowRunDetail | null, nodeId: string): WorkflowVisualiserStatus {
    return toVisualiserStatus(runDetail?.steps.find((candidate) => candidate.nodeId === nodeId)?.status);
}

function getStepFailedSubjects(runDetail: WorkflowRunDetail | null, nodeId: string): WorkflowFailedSubject[] {
    return runDetail?.steps.find((candidate) => candidate.nodeId === nodeId)?.failedSubjects ?? [];
}

function mergeFailedSubjects(subjects: WorkflowFailedSubject[]): WorkflowFailedSubject[] {
    const merged = new Map<string, WorkflowFailedSubject>();
    for (const subject of subjects) {
        const key = `${subject.subjectType}:${subject.subjectId}`;
        if (!merged.has(key)) {
            merged.set(key, subject);
        }
    }
    return [...merged.values()];
}

function buildNodeMaps(definition: WorkflowDefinition) {
    const upstreamIdsByNode = new Map<string, string[]>();
    for (const node of definition.nodes) {
        upstreamIdsByNode.set(node.id, []);
    }
    for (const node of definition.nodes) {
        const targets = [...(node.outputsTo ?? [])];
        if (node.kind === 'module' && node.onFailureTo) {
            targets.push(...node.onFailureTo);
        }
        for (const targetId of targets) {
            const upstream = upstreamIdsByNode.get(targetId) ?? [];
            upstream.push(node.id);
            upstreamIdsByNode.set(targetId, upstream);
        }
    }
    return upstreamIdsByNode;
}

function buildGraph(definition: WorkflowDefinition, runDetail: WorkflowRunDetail | null, getModuleDefinition: (moduleId: string) => ModuleDefinition) {
    const upstreamIdsByNode = buildNodeMaps(definition);
    const nodes = buildVisualiserNodes(definition, runDetail, upstreamIdsByNode, getModuleDefinition);
    const edges = buildVisualiserEdges(definition);

    return { nodes, edges };
}

function buildVisualiserNodes(
    definition: WorkflowDefinition,
    runDetail: WorkflowRunDetail | null,
    upstreamIdsByNode: Map<string, string[]>,
    getModuleDefinition: (moduleId: string) => ModuleDefinition
): WorkflowVisualiserGraphNode[] {
    return definition.nodes.map((node) => {
        const counts = getStepCounts(runDetail, node.id);
        const moduleDef = node.kind === 'module' ? getModuleDefinition(node.moduleId) : undefined;
        const estimatedCostPerCall = moduleDef?.estimatedCostPerCall;
        const totalEstimatedCost = estimatedCostPerCall === undefined ? undefined : estimatedCostPerCall * counts.totalItems;

        return {
            id: node.id,
            label: getNodeLabel(definition, node.id),
            kind: node.kind,
            status: getStepStatus(runDetail, node.id),
            upstreamIds: upstreamIdsByNode.get(node.id) ?? [],
            downstreamIds: [
                ...(node.outputsTo ?? []),
                ...(node.kind === 'module' ? (node.onFailureTo ?? []) : []),
            ],
            moduleId: node.kind === 'module' ? node.moduleId : undefined,
            controlType: node.kind === 'control' ? node.controlType : undefined,
            countNoun: node.presentation?.countNoun ?? DEFAULT_COUNT_NOUN,
            estimatedCostPerCall,
            totalEstimatedCost,
            ...counts,
        };
    });
}

function buildVisualiserEdges(definition: WorkflowDefinition): WorkflowVisualiserGraphEdge[] {
    return definition.nodes.flatMap((node) => {
        const successEdges = (node.outputsTo ?? []).map((targetId) => ({
            id: `${node.id}->${targetId}`,
            source: node.id,
            target: targetId,
            kind: 'default' as const,
        }));

        const failureEdges = (node.kind === 'module' ? (node.onFailureTo ?? []) : []).map((targetId) => ({
            id: `${node.id}->${targetId}:failure`,
            source: node.id,
            target: targetId,
            kind: 'failure' as const,
        }));

        return [...successEdges, ...failureEdges];
    });
}

function summariseStage(
    id: string,
    label: string,
    description: string,
    nodeIds: string[],
    runDetail: WorkflowRunDetail | null,
    definition: WorkflowDefinition,
): WorkflowVisualiserProgressionStage {
    const aggregateCounts = buildAggregateCounts(definition, nodeIds, runDetail);
    const counts = nodeIds.reduce<WorkflowVisualiserCounts>((accumulator, nodeId) => {
        const nodeCounts = getStepCounts(runDetail, nodeId);
        return {
            totalItems: accumulator.totalItems + nodeCounts.totalItems,
            completedItems: accumulator.completedItems + nodeCounts.completedItems,
            failedItems: accumulator.failedItems + nodeCounts.failedItems,
        };
    }, createNodeCounts());

    let stageStatus: WorkflowVisualiserStatus = 'idle';
    if (nodeIds.some((nodeId) => getStepStatus(runDetail, nodeId) === 'failed')) {
        stageStatus = 'failed';
    } else if (nodeIds.some((nodeId) => getStepStatus(runDetail, nodeId) === 'running')) {
        stageStatus = 'running';
    } else if (nodeIds.some((nodeId) => getStepStatus(runDetail, nodeId) === 'completed')) {
        stageStatus = 'completed';
    }

    return {
        id,
        label,
        description,
        status: stageStatus,
        nodeIds,
        countNoun: aggregateCounts[0]?.noun ?? DEFAULT_COUNT_NOUN,
        aggregateCounts,
        ...counts,
    };
}
function buildProgression(definition: WorkflowDefinition, runDetail: WorkflowRunDetail | null) {
    if (definition.presentation?.stages && definition.presentation.stages.length > 0) {
        return {
            stages: definition.presentation.stages.map((stage) =>
                summariseStage(stage.id, stage.label, stage.description, stage.nodeIds, runDetail, definition)
            ),
        };
    }

    return {
        stages: definition.nodes.map((node) => summariseStage(
            `stage-${node.id}`,
            getNodeLabel(definition, node.id),
            node.kind === 'module' ? `Run module ${node.moduleId}.` : `Run control node ${node.controlType}.`,
            [node.id],
            runDetail,
            definition,
        )),
    };
}

function buildText(definition: WorkflowDefinition, runDetail: WorkflowRunDetail | null): { sections: WorkflowVisualiserTextSection[] } {
    const sections: WorkflowVisualiserTextSection[] = [
        {
            id: 'inputs',
            label: 'Inputs',
            items: definition.inputs.map((inputId) => ({ id: inputId, label: inputId })),
        },
        {
            id: 'parameters',
            label: 'Parameters',
            items: (definition.parameters ?? []).map((parameter) => ({
                id: parameter.id,
                label: parameter.id,
                value: parameter.valueType === 'enum' ? `enum: ${(parameter.options ?? []).join(', ')}` : parameter.valueType,
            })),
        },
        {
            id: 'milestones',
            label: 'Milestones',
            items: (definition.presentation?.milestones ?? []).map((milestone) => ({
                id: milestone.id,
                label: milestone.label,
                value: runDetail?.milestones.find((candidate) => candidate.milestoneId === milestone.id)?.status ?? 'idle',
            })),
        },
        {
            id: 'nodes',
            label: 'Nodes',
            items: definition.nodes.map((node) => ({
                id: node.id,
                label: getNodeLabel(definition, node.id),
                value: node.kind === 'module' ? node.moduleId : node.controlType,
            })),
        },
    ];

    if (runDetail) {
        sections.push({
            id: 'run',
            label: 'Run',
            items: [
                { id: 'status', label: 'Status', value: runDetail.summary.status },
                { id: 'total', label: 'Total items', value: String(runDetail.summary.totalItems) },
                { id: 'completed', label: 'Completed items', value: String(runDetail.summary.completedItems) },
                { id: 'failed', label: 'Failed items', value: String(runDetail.summary.failedItems) },
            ],
        });
    }

    return { sections };
}

function buildDetails(
    graphNodes: WorkflowVisualiserGraphNode[],
    progressionStages: WorkflowVisualiserProgressionStage[],
    runDetail: WorkflowRunDetail | null,
    workflowDefinition: WorkflowDefinition,
): WorkflowVisualiserDetail[] {
    const nodeDetails = graphNodes.map((node) => ({
        ...(() => {
            const sourceNode = workflowDefinition.nodes.find((candidate) => candidate.id === node.id);
            const settings = sourceNode?.kind === 'module'
                ? Object.entries(sourceNode.parameters ?? {}).map(([id, value]) => ({ id, value }))
                : undefined;
            return settings && settings.length > 0 ? { settings } : {};
        })(),
        id: node.id,
        label: node.label,
        description: node.kind === 'module'
            ? `Module node ${node.moduleId ?? node.id}.`
            : `Control node ${node.controlType ?? node.id}.`,
        kind: node.kind,
        status: node.status,
        errorMessage: getStepErrorMessage(runDetail, node.id),
        upstreamIds: node.upstreamIds,
        downstreamIds: node.downstreamIds,
        counts: createNodeCounts(node.totalItems, node.completedItems, node.failedItems),
        countNoun: node.countNoun,
        aggregateCounts: [{ noun: node.countNoun, totalItems: node.totalItems, completedItems: node.completedItems, failedItems: node.failedItems }],
        failedSubjects: getStepFailedSubjects(runDetail, node.id),
        moduleId: node.moduleId,
        controlType: node.controlType,
    } satisfies WorkflowVisualiserDetail));

    const stageDetails = progressionStages.map((stage) => ({
        id: stage.id,
        label: stage.label,
        description: stage.description,
        kind: 'stage',
        status: stage.status,
        upstreamIds: [],
        downstreamIds: [],
        counts: createNodeCounts(stage.totalItems, stage.completedItems, stage.failedItems),
        countNoun: stage.countNoun,
        aggregateCounts: stage.aggregateCounts,
        failedSubjects: mergeFailedSubjects(stage.nodeIds.flatMap((nodeId) => getStepFailedSubjects(runDetail, nodeId))),
    } satisfies WorkflowVisualiserDetail));

    return [...stageDetails, ...nodeDetails];
}

function toLinkedRun(run: WorkflowRunListItem, relationship: WorkflowVisualiserLinkedRun['relationship']): WorkflowVisualiserLinkedRun {
    return {
        runId: run.runId,
        workflowId: run.workflowId,
        displayName: run.displayName,
        status: run.status,
        createdAt: run.createdAt,
        relationship,
        totalItems: run.totalItems,
        completedItems: run.completedItems,
        failedItems: run.failedItems,
    };
}

function buildLinkedRuns(runDetail: WorkflowRunDetail, allRuns: WorkflowRunListItem[]): WorkflowVisualiserLinkedRun[] {
    const linkedRuns: WorkflowVisualiserLinkedRun[] = [];
    const sourceFolderRunId = typeof runDetail.parameters.sourceFolderRunId === 'string'
        ? runDetail.parameters.sourceFolderRunId
        : null;

    if (sourceFolderRunId) {
        const sourceRun = allRuns.find((candidate) => candidate.runId === sourceFolderRunId);
        if (sourceRun) {
            linkedRuns.push(toLinkedRun(sourceRun, 'source'));
        }
    }

    const recoveryRuns = allRuns.filter((candidate) => (
        typeof candidate.parameters.sourceFolderRunId === 'string'
        && candidate.parameters.sourceFolderRunId === runDetail.summary.runId
    ));
    for (const recoveryRun of recoveryRuns) {
        linkedRuns.push(toLinkedRun(recoveryRun, 'recovery'));
    }

    return linkedRuns;
}

function buildSelectedRun(
    runDetail: WorkflowRunDetail | null,
    availableRuns: WorkflowRunListItem[],
    allRuns: WorkflowRunListItem[],
    workflowId: string,
): WorkflowVisualiserRunSummary | null {
    if (!runDetail) {
        return null;
    }
    const snapshot = availableRuns.find((run) => run.runId === runDetail.summary.runId);
    return {
        runId: runDetail.summary.runId,
        workflowId,
        status: runDetail.summary.status,
        createdAt: snapshot?.createdAt,
        parameters: runDetail.parameters,
        totalItems: runDetail.summary.totalItems,
        completedItems: runDetail.summary.completedItems,
        failedItems: runDetail.summary.failedItems,
        linkedRuns: buildLinkedRuns(runDetail, allRuns),
    };
}

export function getWorkflowDisplayName(definition: WorkflowDefinition): string {
    return definition.presentation?.defaultRunLabel ?? toTitleCase(definition.id);
}

export function buildWorkflowVisualiserWorkflowSummary(definition: WorkflowDefinition): WorkflowVisualiserWorkflowSummary {
    return {
        workflowId: definition.id,
        displayName: getWorkflowDisplayName(definition),
    };
}

export function buildWorkflowVisualiserModel(params: BuildWorkflowVisualiserParams & { getModuleDefinition: (moduleId: string) => ModuleDefinition }): WorkflowVisualiserModel {
    const displayName = getWorkflowDisplayName(params.workflowDefinition);
    const graph = buildGraph(params.workflowDefinition, params.runDetail, params.getModuleDefinition);
    const progression = buildProgression(params.workflowDefinition, params.runDetail);

    return {
        workflowId: params.workflowDefinition.id,
        displayName,
        availableWorkflows: params.availableWorkflows,
        selectedRun: buildSelectedRun(params.runDetail, params.availableRuns, params.allRuns, params.workflowDefinition.id),
        availableRuns: params.availableRuns,
        tabs: {
            overview: {
                summary: {
                    title: displayName,
                    description: DEFAULT_WORKFLOW_DESCRIPTION,
                },
                milestones: (params.workflowDefinition.presentation?.milestones ?? []).map((milestone) => ({
                    milestoneId: milestone.id,
                    label: milestone.label,
                    status: params.runDetail?.milestones.find((candidate) => candidate.milestoneId === milestone.id)?.status ?? 'idle',
                })),
                aggregateCounts: buildAggregateCounts(
                    params.workflowDefinition,
                    params.workflowDefinition.nodes.map((node) => node.id),
                    params.runDetail,
                ),
            },
            progression,
            graph,
            text: buildText(params.workflowDefinition, params.runDetail),
        },
        details: buildDetails(graph.nodes, progression.stages, params.runDetail, params.workflowDefinition),
    };
}

function buildModuleRepositoryModule(
    manifest: WorkflowModulePluginManifest,
    workflows: WorkflowDefinition[],
): WorkflowModuleRepositoryModule {
    return {
        id: manifest.id,
        contractVersion: manifest.contractVersion,
        displayName: manifest.displayName,
        description: manifest.description,
        inputs: manifest.inputs,
        outputs: manifest.outputs,
        capabilities: manifest.capabilities,
        milestones: manifest.milestones ?? [],
        errorKinds: manifest.errorKinds ?? [],
        fixtures: manifest.fixtures ?? [],
        workflows: workflows
            .filter((workflow) => workflow.nodes.some((node) => node.kind === 'module' && node.moduleId === manifest.id))
            .map(buildWorkflowVisualiserWorkflowSummary),
    };
}

export function buildWorkflowModuleRepositoryModel(params: {
    pluginManifests: WorkflowModulePluginManifest[];
    workflows: WorkflowDefinition[];
}): WorkflowModuleRepositoryModel {
    return {
        modules: params.pluginManifests
            .map((manifest) => buildModuleRepositoryModule(manifest, params.workflows))
            .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    };
}

function selectRunId(params: {
    requestedRunId?: string | null;
    workflowId: string;
    availableRuns: WorkflowRunListItem[];
}): string | null {
    if (params.requestedRunId === null) {
        return null;
    }

    if (params.requestedRunId) {
        return params.requestedRunId;
    }
    const workflowRuns = params.availableRuns.filter((run) => run.workflowId === params.workflowId);
    const activeRun = workflowRuns.find((run) => run.status === 'running');
    return activeRun?.runId ?? workflowRuns[0]?.runId ?? null;
}

export function getWorkflowVisualiserModel(params: {
    db: DbLike;
    workflowDefinition: WorkflowDefinition;
    availableWorkflowDefinitions: WorkflowDefinition[];
    getRunDetail: (runId: string) => WorkflowRunDetail;
    requestedRunId?: string | null;
    getModuleDefinition: (moduleId: string) => ModuleDefinition;
}): WorkflowVisualiserModel {
    const allRuns = getWorkflowRunsSnapshot(params.db);
    const availableRuns = allRuns.filter((run) => run.workflowId === params.workflowDefinition.id);
    const selectedRunId = selectRunId({
        requestedRunId: params.requestedRunId,
        workflowId: params.workflowDefinition.id,
        availableRuns,
    });

    return buildWorkflowVisualiserModel({
        workflowDefinition: params.workflowDefinition,
        availableWorkflows: params.availableWorkflowDefinitions.map(buildWorkflowVisualiserWorkflowSummary),
        runDetail: selectedRunId ? params.getRunDetail(selectedRunId) : null,
        availableRuns,
        allRuns,
        getModuleDefinition: params.getModuleDefinition,
    });
}
