import type { WorkflowRunListItem } from '@contracts/jobs';
import type {
    WorkflowVisualiserAggregateCount,
    WorkflowVisualiserCounts,
    WorkflowVisualiserCountNoun,
    WorkflowVisualiserDetail,
    WorkflowVisualiserGraphEdge,
    WorkflowVisualiserGraphNode,
    WorkflowVisualiserModel,
    WorkflowVisualiserProgressionStage,
    WorkflowVisualiserRunSummary,
    WorkflowVisualiserStatus,
    WorkflowVisualiserTextSection,
} from '@contracts/workflowVisualiser';
import type { WorkflowDefinition } from '../workflowRuntime/contracts';
import type { WorkflowRunDetail } from '../workflowRuntime/executionStore';
import { getWorkflowRunsSnapshot } from './systemWorkflowRunSnapshot';

type BuildWorkflowVisualiserParams = {
    workflowDefinition: WorkflowDefinition;
    runDetail: WorkflowRunDetail | null;
    availableRuns: WorkflowRunListItem[];
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

function buildNodeMaps(definition: WorkflowDefinition) {
    const upstreamIdsByNode = new Map<string, string[]>();
    for (const node of definition.nodes) {
        upstreamIdsByNode.set(node.id, []);
    }
    for (const node of definition.nodes) {
        for (const targetId of node.outputsTo ?? []) {
            const upstream = upstreamIdsByNode.get(targetId) ?? [];
            upstream.push(node.id);
            upstreamIdsByNode.set(targetId, upstream);
        }
    }
    return upstreamIdsByNode;
}

function buildGraph(definition: WorkflowDefinition, runDetail: WorkflowRunDetail | null) {
    const upstreamIdsByNode = buildNodeMaps(definition);
    const nodes: WorkflowVisualiserGraphNode[] = definition.nodes.map((node) => {
        const counts = getStepCounts(runDetail, node.id);
        return {
            id: node.id,
            label: getNodeLabel(definition, node.id),
            kind: node.kind,
            status: getStepStatus(runDetail, node.id),
            upstreamIds: upstreamIdsByNode.get(node.id) ?? [],
            downstreamIds: [...(node.outputsTo ?? [])],
            moduleId: node.kind === 'module' ? node.moduleId : undefined,
            controlType: node.kind === 'control' ? node.controlType : undefined,
            countNoun: node.presentation?.countNoun ?? DEFAULT_COUNT_NOUN,
            ...counts,
        };
    });

    const edges: WorkflowVisualiserGraphEdge[] = definition.nodes.flatMap((node) => (
        (node.outputsTo ?? []).map((targetId) => ({
            id: `${node.id}->${targetId}`,
            source: node.id,
            target: targetId,
        }))
    ));

    return { nodes, edges };
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

    const stageStatus = nodeIds.some((nodeId) => getStepStatus(runDetail, nodeId) === 'failed')
        ? 'failed'
        : nodeIds.some((nodeId) => getStepStatus(runDetail, nodeId) === 'running')
            ? 'running'
            : nodeIds.some((nodeId) => getStepStatus(runDetail, nodeId) === 'completed')
                ? 'completed'
                : 'idle';

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
    if (definition.id === 'folder_ingest_v1') {
        return {
            stages: [
                summariseStage('discovery', 'Discovery', 'Scan the folder and discover files.', ['scan-folder'], runDetail, definition),
                summariseStage(
                    'library-ready',
                    'Ingest',
                    'Prepare previews and unlock the browsable library.',
                    ['preview-each', 'generate-previews', 'collect-previewed-assets'],
                    runDetail,
                    definition,
                ),
                summariseStage(
                    'enrichment',
                    'Enrichment',
                    'Run downstream analysis, grouping, and metadata branches.',
                    [
                        'enrichment-each',
                        'extract-embedded-metadata',
                        'detect-faces',
                        'generate-face-vectors',
                        'collect-people',
                        'resolve-people',
                        'collect-similar',
                        'group-similar-photos',
                        'detect-sensitive-content',
                        'generate-ai-metadata',
                    ],
                    runDetail,
                    definition,
                ),
            ],
        };
    }

    return {
        stages: definition.nodes.map((node) => summariseStage(
            node.id,
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
): WorkflowVisualiserDetail[] {
    const nodeDetails = graphNodes.map((node) => ({
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
    } satisfies WorkflowVisualiserDetail));

    return [...stageDetails, ...nodeDetails];
}

function buildSelectedRun(runDetail: WorkflowRunDetail | null, availableRuns: WorkflowRunListItem[], workflowId: string): WorkflowVisualiserRunSummary | null {
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
    };
}

export function buildWorkflowVisualiserModel(params: BuildWorkflowVisualiserParams): WorkflowVisualiserModel {
    const displayName = params.workflowDefinition.presentation?.defaultRunLabel ?? toTitleCase(params.workflowDefinition.id);
    const graph = buildGraph(params.workflowDefinition, params.runDetail);
    const progression = buildProgression(params.workflowDefinition, params.runDetail);

    return {
        workflowId: params.workflowDefinition.id,
        displayName,
        selectedRun: buildSelectedRun(params.runDetail, params.availableRuns, params.workflowDefinition.id),
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
        details: buildDetails(graph.nodes, progression.stages, params.runDetail),
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
    getRunDetail: (runId: string) => WorkflowRunDetail;
    requestedRunId?: string | null;
}): WorkflowVisualiserModel {
    const availableRuns = getWorkflowRunsSnapshot(params.db).filter((run) => run.workflowId === params.workflowDefinition.id);
    const selectedRunId = selectRunId({
        requestedRunId: params.requestedRunId,
        workflowId: params.workflowDefinition.id,
        availableRuns,
    });

    return buildWorkflowVisualiserModel({
        workflowDefinition: params.workflowDefinition,
        runDetail: selectedRunId ? params.getRunDetail(selectedRunId) : null,
        availableRuns,
    });
}
