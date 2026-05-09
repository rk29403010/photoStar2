export type SubjectRef = {
    subjectType: string;
    subjectId: string;
};

export type CapabilityClass =
    | 'analyze'
    | 'derive'
    | 'group'
    | 'annotate'
    | 'mutate_library'
    | 'external_api';

export type SubjectSummaryDefinition = {
    titleField: string;
    subtitleField?: string;
    thumbnailStrategy?: 'asset' | 'none';
}

export type SubjectUiDefinition = {
    badges?: string[];
    detailSections: string[];
}

export type SubjectRelationDefinition = {
    type: string;
    target: string;
}

export type SubjectLabelDefinition = {
    singular: string;
    plural: string;
}

export type SubjectTypeDefinition = {
    id: string;
    version: number;
    durable: boolean;
    summary: SubjectSummaryDefinition;
    progressSemantics: 'per_subject' | 'per_related_asset' | 'aggregate';
    relations: SubjectRelationDefinition[];
    ui: SubjectUiDefinition;
    labels?: SubjectLabelDefinition;
}

export type WorkflowModuleNodeDefinition = {
    id: string;
    kind: 'module';
    moduleId: string;
    runMode?: 'per_subject' | 'once_per_batch';
    completesMilestones?: string[];
    outputsTo?: string[];
    presentation?: WorkflowNodePresentationDefinition;
}

export type WorkflowControlNodeDefinition = {
    id: string;
    kind: 'control';
    controlType: 'for_each' | 'batch' | 'collect' | 'approval_gate';
    outputsTo?: string[];
    presentation?: WorkflowNodePresentationDefinition;
}

export type WorkflowNodeDefinition = WorkflowModuleNodeDefinition | WorkflowControlNodeDefinition;

export type WorkflowParameterValueType = 'string' | 'boolean' | 'enum';

export type WorkflowParameterDefinition = {
    id: string;
    valueType: WorkflowParameterValueType;
    required: boolean;
    options?: string[];
}

export type WorkflowMilestoneDefinition = {
    id: string;
    label: string;
}

export type WorkflowCountNounDefinition = {
    singular: string;
    plural: string;
}

export type WorkflowNodePresentationDefinition = {
    label?: string;
    countNoun?: WorkflowCountNounDefinition;
    artifactNoun?: WorkflowCountNounDefinition;
}

export type WorkflowPresentationDefinition = {
    defaultRunLabel: string;
    milestones: WorkflowMilestoneDefinition[];
}

export type ModuleArtifactOutputDefinition = {
    kind: 'artifact';
    artifactType: string;
    subjectType: string;
}

export type ModuleOutputDefinition = ModuleArtifactOutputDefinition;

export type RuntimeModuleContext = {
    runId: string;
    subject: {
        subjectType: string;
        subjectId: string;
    };
    batchSubjects: Array<{
        subjectType: string;
        subjectId: string;
    }>;
    parameters: Record<string, unknown>;
    signal?: AbortSignal;
}

export type RuntimeModuleRunResult = {
    outputs: ModuleOutputDefinition[];
    emittedSubjects?: Array<{
        subjectType: string;
        subjectId: string;
    }>;
}

export type ModuleDefinition = {
    id: string;
    version: number;
    capability: CapabilityClass;
    accepts: string[];
    produces: ModuleOutputDefinition[];
    run: (context: RuntimeModuleContext) => Promise<RuntimeModuleRunResult> | RuntimeModuleRunResult;
}

export type WorkflowDefinition = {
    id: string;
    version: number;
    inputs: string[];
    parameters?: WorkflowParameterDefinition[];
    presentation?: WorkflowPresentationDefinition;
    nodes: WorkflowNodeDefinition[];
}

const SUBJECT_PROGRESS_SEMANTICS = new Set<SubjectTypeDefinition['progressSemantics']>([
    'per_subject',
    'per_related_asset',
    'aggregate',
]);

const WORKFLOW_CONTROL_TYPES = new Set<WorkflowControlNodeDefinition['controlType']>([
    'for_each',
    'batch',
    'collect',
    'approval_gate',
]);

const MODULE_CAPABILITIES = new Set<CapabilityClass>([
    'analyze',
    'derive',
    'group',
    'annotate',
    'mutate_library',
    'external_api',
]);

const WORKFLOW_PARAMETER_TYPES = new Set<WorkflowParameterValueType>(['string', 'boolean', 'enum']);

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

function assertStringArray(value: unknown, fieldName: string): asserts value is string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
        throw new Error(`${fieldName} must be an array of non-empty strings`);
    }
}

function assertSubjectLabels(value: unknown, fieldName: string): asserts value is SubjectLabelDefinition {
    if (typeof value !== 'object' || value === null) {
        throw new Error(`${fieldName} must be an object`);
    }

    const labels = value as SubjectLabelDefinition;
    assertNonEmptyString(labels.singular, `${fieldName}.singular`);
    assertNonEmptyString(labels.plural, `${fieldName}.plural`);
}

function assertWorkflowParameterDefinition(
    value: WorkflowParameterDefinition,
    fieldName: string,
): void {
    assertNonEmptyString(value.id, `${fieldName}.id`);
    if (!WORKFLOW_PARAMETER_TYPES.has(value.valueType)) {
        throw new Error(`${fieldName}.valueType is invalid`);
    }
    if (typeof value.required !== 'boolean') {
        throw new Error(`${fieldName}.required must be boolean`);
    }

    if (value.valueType === 'enum') {
        assertStringArray(value.options, `${fieldName}.options`);
        if (value.options.length === 0) {
            throw new Error(`${fieldName}.options must contain at least one value`);
        }
        return;
    }

    if (value.options !== undefined) {
        assertStringArray(value.options, `${fieldName}.options`);
    }
}

function assertWorkflowMilestoneDefinition(
    value: WorkflowMilestoneDefinition,
    fieldName: string,
): void {
    assertNonEmptyString(value.id, `${fieldName}.id`);
    assertNonEmptyString(value.label, `${fieldName}.label`);
}

function assertWorkflowCountNounDefinition(value: WorkflowCountNounDefinition, fieldName: string): void {
    assertNonEmptyString(value.singular, `${fieldName}.singular`);
    assertNonEmptyString(value.plural, `${fieldName}.plural`);
}

function assertWorkflowNodePresentationDefinition(
    value: WorkflowNodePresentationDefinition,
    fieldName: string,
): void {
    if (value.label !== undefined) {
        assertNonEmptyString(value.label, `${fieldName}.label`);
    }
    if (value.countNoun !== undefined) {
        assertWorkflowCountNounDefinition(value.countNoun, `${fieldName}.countNoun`);
    }
    if (value.artifactNoun !== undefined) {
        assertWorkflowCountNounDefinition(value.artifactNoun, `${fieldName}.artifactNoun`);
    }
}

function assertWorkflowPresentationDefinition(
    value: WorkflowPresentationDefinition,
    fieldName: string,
): void {
    assertNonEmptyString(value.defaultRunLabel, `${fieldName}.defaultRunLabel`);
    if (!Array.isArray(value.milestones)) {
        throw new Error(`${fieldName}.milestones must be an array`);
    }
    for (const [index, milestone] of value.milestones.entries()) {
        assertWorkflowMilestoneDefinition(milestone, `${fieldName}.milestones[${index}]`);
    }
}

function assertUniqueNodeIds(nodes: WorkflowNodeDefinition[]): void {
    const seen = new Set<string>();
    for (const node of nodes) {
        if (seen.has(node.id)) {
            throw new Error(`workflow nodes must have unique ids: '${node.id}'`);
        }
        seen.add(node.id);
    }
}

function assertNodeEdgesExist(nodes: WorkflowNodeDefinition[]): void {
    const ids = new Set(nodes.map((node) => node.id));
    for (const node of nodes) {
        for (const targetId of node.outputsTo || []) {
            if (!ids.has(targetId)) {
                throw new Error(`workflow node '${node.id}' references unknown target '${targetId}'`);
            }
        }
    }
}

function visitNode(
    nodeId: string,
    adjacency: Map<string, string[]>,
    visiting: Set<string>,
    visited: Set<string>,
): void {
    if (visited.has(nodeId)) {
        return;
    }
    if (visiting.has(nodeId)) {
        throw new Error(`workflow definition contains a cycle involving '${nodeId}'`);
    }

    visiting.add(nodeId);
    for (const targetId of adjacency.get(nodeId) || []) {
        visitNode(targetId, adjacency, visiting, visited);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
}

function assertDag(nodes: WorkflowNodeDefinition[]): void {
    const adjacency = new Map<string, string[]>(
        nodes.map((node) => [node.id, [...(node.outputsTo || [])]]),
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();

    for (const node of nodes) {
        visitNode(node.id, adjacency, visiting, visited);
    }
}

function assertPositiveVersion(value: number, fieldName: string): void {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
}

function assertModuleNode(node: WorkflowModuleNodeDefinition): void {
    assertNonEmptyString(node.moduleId, `workflow node '${node.id}' moduleId`);
    if (node.runMode !== undefined && node.runMode !== 'per_subject' && node.runMode !== 'once_per_batch') {
        throw new Error(`workflow node '${node.id}' runMode is invalid`);
    }
    if (node.completesMilestones !== undefined) {
        assertStringArray(node.completesMilestones, `workflow node '${node.id}' completesMilestones`);
    }
    if (node.outputsTo !== undefined) {
        assertStringArray(node.outputsTo, `workflow node '${node.id}' outputsTo`);
    }
    if (node.presentation !== undefined) {
        assertWorkflowNodePresentationDefinition(node.presentation, `workflow node '${node.id}' presentation`);
    }
}

function assertControlNode(node: WorkflowControlNodeDefinition): void {
    if (!WORKFLOW_CONTROL_TYPES.has(node.controlType)) {
        throw new Error(`unsupported workflow control type '${String(node.controlType)}'`);
    }
    if (node.outputsTo !== undefined) {
        assertStringArray(node.outputsTo, `workflow node '${node.id}' outputsTo`);
    }
    if (node.presentation !== undefined) {
        assertWorkflowNodePresentationDefinition(node.presentation, `workflow node '${node.id}' presentation`);
    }
}

function assertWorkflowNode(node: WorkflowNodeDefinition): void {
    assertNonEmptyString(node.id, 'workflow.node.id');
    if (node.kind === 'module') {
        assertModuleNode(node);
        return;
    }
    if (node.kind === 'control') {
        assertControlNode(node);
        return;
    }
    throw new Error(`unsupported workflow node kind '${String((node as { kind?: unknown }).kind)}'`);
}

function assertModuleOutput(output: ModuleOutputDefinition): void {
    if (output.kind !== 'artifact') {
        throw new Error(`unsupported module output kind '${String(output.kind)}'`);
    }
    assertNonEmptyString(output.artifactType, 'module output artifactType');
    assertNonEmptyString(output.subjectType, 'module output subjectType');
}

export function validateSubjectType(definition: SubjectTypeDefinition): void {
    assertNonEmptyString(definition.id, 'subjectType.id');
    assertPositiveVersion(definition.version, 'subjectType.version');
    if (typeof definition.durable !== 'boolean') {
        throw new Error('subjectType.durable must be boolean');
    }
    assertNonEmptyString(definition.summary?.titleField, 'subjectType.summary.titleField');
    if (!SUBJECT_PROGRESS_SEMANTICS.has(definition.progressSemantics)) {
        throw new Error('subjectType.progressSemantics must be one of per_subject, per_related_asset, aggregate');
    }
    if (!Array.isArray(definition.relations)) {
        throw new Error('subjectType.relations must be an array');
    }
    if (!definition.ui || !Array.isArray(definition.ui.detailSections)) {
        throw new Error('subjectType.ui.detailSections must be an array');
    }
    if (definition.labels !== undefined) {
        assertSubjectLabels(definition.labels, 'subjectType.labels');
    }
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): void {
    assertNonEmptyString(definition.id, 'workflow.id');
    assertPositiveVersion(definition.version, 'workflow.version');
    assertStringArray(definition.inputs, 'workflow.inputs');
    if (definition.parameters !== undefined) {
        if (!Array.isArray(definition.parameters)) {
            throw new Error('workflow.parameters must be an array');
        }
        for (const [index, parameter] of definition.parameters.entries()) {
            assertWorkflowParameterDefinition(parameter, `workflow.parameters[${index}]`);
        }
    }
    if (definition.presentation !== undefined) {
        assertWorkflowPresentationDefinition(definition.presentation, 'workflow.presentation');
    }
    if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) {
        throw new Error('workflow.nodes must be a non-empty array');
    }

    for (const node of definition.nodes) {
        assertWorkflowNode(node);
    }

    assertUniqueNodeIds(definition.nodes);
    assertNodeEdgesExist(definition.nodes);
    assertDag(definition.nodes);
}

export function validateModuleDefinition(definition: ModuleDefinition): void {
    assertNonEmptyString(definition.id, 'module.id');
    assertPositiveVersion(definition.version, 'module.version');
    if (!MODULE_CAPABILITIES.has(definition.capability)) {
        throw new Error('module.capability is invalid');
    }
    assertStringArray(definition.accepts, 'module.accepts');
    if (!Array.isArray(definition.produces)) {
        throw new Error('module.produces must be an array');
    }
    for (const output of definition.produces) {
        assertModuleOutput(output);
    }
    if (typeof definition.run !== 'function') {
        throw new Error('module.run must be a function');
    }
}
