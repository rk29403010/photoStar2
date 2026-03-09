import type { DomainEvent, EventType } from '../events/types';
import { getDefaultWorkflowModules, resolveWorkflowModulesFromSetting } from './workflowModules';

export const WORKFLOW_STAGE_OVERRIDES_SETTING = 'workflow_stage_overrides_json';
export const WORKFLOW_MODULES_SETTING = 'workflow_modules_json';

export type QueueStage = string;
export type PreviewReason = 'ingest' | 'repair' | 'rebuild';

export type StageGateMode = 'strict' | 'opportunistic';
export type ActiveCounterMode = 'task_queue' | 'jobs_running';

type MediaBatchEvent =
    | 'PreviewRequested'
    | 'FaceDetectionRequested'
    | 'FaceRecognitionRequested'
    | 'SensitiveScanRequested'
    | 'AiMetadataRequested';

type SignalEvent = 'FaceClusteringRequested';

type PreviewDispatch = { kind: 'media_batch'; event: 'PreviewRequested'; reason: PreviewReason };
type GenericMediaDispatch = {
    kind: 'media_batch';
    event: Exclude<MediaBatchEvent, 'PreviewRequested'>;
    queueMode?: 'fresh' | 'pro_pending' | 'all';
};

type MediaBatchDispatch = PreviewDispatch | GenericMediaDispatch;

type SignalDispatch = {
    kind: 'signal';
    event: SignalEvent;
    completePendingRowsBeforeEmit?: boolean;
};

export type StageDispatch = MediaBatchDispatch | SignalDispatch;

export interface StagePolicy {
    stage: QueueStage;
    order: number;
    gate: StageGateMode;
    activeCounter: ActiveCounterMode;
    jobsRunningLike?: string;
    batchLimit?: number;
    useHeavyBatching?: boolean;
    dispatch: StageDispatch;
}

export type QueueTransitionCondition = 'always' | 'auto_preview_on' | 'auto_preview_off' | 'face_count_positive';
export type QueueTransitionMediaIdField = 'mediaId' | 'assetId';

export type QueueTransitionAction =
    | { kind: 'queue_upsert'; stage: QueueStage; priority?: number }
    | { kind: 'queue_complete'; stage: QueueStage };

export type QueueTransitionEventType = EventType;

export interface QueueTransitionRule {
    id: string;
    eventType: QueueTransitionEventType;
    mediaIdField?: QueueTransitionMediaIdField;
    condition?: QueueTransitionCondition;
    actions: QueueTransitionAction[];
    triggerEvaluate?: boolean;
}

export interface WorkflowModuleDefinition {
    id: string;
    description: string;
    enabledByDefault?: boolean;
    stagePolicies: StagePolicy[];
    transitionRules: QueueTransitionRule[];
}

const MEDIA_BATCH_EVENTS = new Set<MediaBatchEvent>([
    'PreviewRequested',
    'FaceDetectionRequested',
    'FaceRecognitionRequested',
    'SensitiveScanRequested',
    'AiMetadataRequested'
]);

const SIGNAL_EVENTS = new Set<SignalEvent>(['FaceClusteringRequested']);
const PREVIEW_REASONS = new Set<PreviewReason>(['ingest', 'repair', 'rebuild']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasDefinedField(record: Record<string, unknown>, field: string): boolean {
    return field in record && record[field] !== undefined;
}

function cloneDispatch(dispatch: StageDispatch): StageDispatch {
    return { ...dispatch };
}

function clonePolicy(policy: StagePolicy): StagePolicy {
    return { ...policy, dispatch: cloneDispatch(policy.dispatch) };
}

function cloneTransitionRule(rule: QueueTransitionRule): QueueTransitionRule {
    return {
        ...rule,
        actions: rule.actions.map(action => ({ ...action }))
    };
}

function sortStagePolicies(policies: StagePolicy[]): StagePolicy[] {
    return [...policies].sort((left, right) => left.order - right.order);
}

function buildStagePoliciesFromModules(modules: WorkflowModuleDefinition[]): StagePolicy[] {
    const byStage = new Map<string, StagePolicy>();

    for (const module of modules) {
        for (const policy of module.stagePolicies) {
            byStage.set(policy.stage, clonePolicy(policy));
        }
    }

    return sortStagePolicies(Array.from(byStage.values()));
}

function buildTransitionRulesFromModules(modules: WorkflowModuleDefinition[]): QueueTransitionRule[] {
    const byId = new Map<string, QueueTransitionRule>();

    for (const module of modules) {
        for (const rule of module.transitionRules) {
            if (byId.has(rule.id)) {continue;}
            byId.set(rule.id, cloneTransitionRule(rule));
        }
    }

    return Array.from(byId.values());
}

export { registerWorkflowModule, listWorkflowModules } from './workflowModules';

export const DEFAULT_WORKFLOW_MODULES: WorkflowModuleDefinition[] = getDefaultWorkflowModules();
export const STAGE_POLICIES: StagePolicy[] = buildStagePoliciesFromModules(DEFAULT_WORKFLOW_MODULES);
export const QUEUE_TRANSITION_RULES: QueueTransitionRule[] = buildTransitionRulesFromModules(DEFAULT_WORKFLOW_MODULES);
export const QUEUE_TRANSITION_EVENT_TYPES: QueueTransitionEventType[] = Array.from(
    new Set(QUEUE_TRANSITION_RULES.map(rule => rule.eventType))
);

type StagePolicyOverride = {
    order?: unknown;
    gate?: unknown;
    activeCounter?: unknown;
    jobsRunningLike?: unknown;
    batchLimit?: unknown;
    useHeavyBatching?: unknown;
    dispatch?: unknown;
};

function parseOverrideSource(rawSetting: string): { source: Record<string, unknown> | null; errors: string[] } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawSetting);
    } catch (err) {
        return { source: null, errors: [`Invalid JSON: ${String(err)}`] };
    }

    if (!isRecord(parsed)) {
        return { source: null, errors: ['Overrides root must be an object'] };
    }

    const source = isRecord(parsed.stages) ? parsed.stages : parsed;
    return { source, errors: [] };
}

function collectUnknownStageOverrideErrors(source: Record<string, unknown>, allowedStages: string[], errors: string[]) {
    const stageSet = new Set<string>(allowedStages);
    for (const key of Object.keys(source)) {
        if (!stageSet.has(key)) {
            errors.push(`Unknown stage override '${key}'. Allowed: ${allowedStages.join(', ')}`);
        }
    }
}

function parseMediaBatchEvent(
    raw: Record<string, unknown>,
    stage: QueueStage,
    errors: string[],
    fallback: MediaBatchEvent
): MediaBatchEvent {
    if (!hasDefinedField(raw, 'event')) {return fallback;}
    const value = raw.event;
    if (typeof value === 'string' && MEDIA_BATCH_EVENTS.has(value as MediaBatchEvent)) {
        return value as MediaBatchEvent;
    }
    errors.push(`[${stage}] dispatch.event must be one of: ${Array.from(MEDIA_BATCH_EVENTS).join(', ')}`);
    return fallback;
}

function parsePreviewReason(
    raw: Record<string, unknown>,
    stage: QueueStage,
    errors: string[],
    fallback: PreviewReason
): PreviewReason {
    if (!hasDefinedField(raw, 'reason')) {return fallback;}
    const value = raw.reason;
    if (typeof value === 'string' && PREVIEW_REASONS.has(value as PreviewReason)) {
        return value as PreviewReason;
    }
    errors.push(`[${stage}] dispatch.reason must be one of: ${Array.from(PREVIEW_REASONS).join(', ')}`);
    return fallback;
}

function parseSignalEvent(
    raw: Record<string, unknown>,
    stage: QueueStage,
    errors: string[],
    fallback: SignalEvent
): SignalEvent {
    if (!hasDefinedField(raw, 'event')) {return fallback;}
    const value = raw.event;
    if (typeof value === 'string' && SIGNAL_EVENTS.has(value as SignalEvent)) {
        return value as SignalEvent;
    }
    errors.push(`[${stage}] dispatch.event for signal stages must be one of: ${Array.from(SIGNAL_EVENTS).join(', ')}`);
    return fallback;
}

function applyMediaBatchDispatchOverride(
    base: MediaBatchDispatch,
    raw: Record<string, unknown>,
    stage: QueueStage,
    errors: string[]
): StageDispatch {
    const event = parseMediaBatchEvent(raw, stage, errors, base.event);

    if (event !== 'PreviewRequested') {
        return { kind: 'media_batch', event, queueMode: 'queueMode' in base ? base.queueMode : undefined };
    }

    const fallbackReason: PreviewReason = base.event === 'PreviewRequested' ? base.reason : 'ingest';
    const reason = parsePreviewReason(raw, stage, errors, fallbackReason);
    return { kind: 'media_batch', event: 'PreviewRequested', reason };
}

function applySignalDispatchOverride(
    base: SignalDispatch,
    raw: Record<string, unknown>,
    stage: QueueStage,
    errors: string[]
): StageDispatch {
    const next: SignalDispatch = { ...base };
    next.event = parseSignalEvent(raw, stage, errors, base.event);

    if (hasDefinedField(raw, 'completePendingRowsBeforeEmit')) {
        if (typeof raw.completePendingRowsBeforeEmit === 'boolean') {
            next.completePendingRowsBeforeEmit = raw.completePendingRowsBeforeEmit;
        } else {
            errors.push(`[${stage}] dispatch.completePendingRowsBeforeEmit must be boolean`);
        }
    }

    return next;
}

function applyDispatchOverride(base: StageDispatch, raw: unknown, stage: QueueStage, errors: string[]): StageDispatch {
    if (!isRecord(raw)) {
        errors.push(`[${stage}] dispatch must be an object`);
        return base;
    }

    return base.kind === 'media_batch'
        ? applyMediaBatchDispatchOverride(base, raw, stage, errors)
        : applySignalDispatchOverride(base, raw, stage, errors);
}

function applyOrderOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    if (override.order === undefined) {return;}
    if (typeof override.order === 'number' && Number.isFinite(override.order)) {
        next.order = override.order;
        return;
    }
    errors.push(`[${stage}] order must be a finite number`);
}

function applyGateOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    if (override.gate === undefined) {return;}
    if (override.gate === 'strict' || override.gate === 'opportunistic') {
        next.gate = override.gate;
        return;
    }
    errors.push(`[${stage}] gate must be 'strict' or 'opportunistic'`);
}

function applyActiveCounterOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    if (override.activeCounter === undefined) {return;}
    if (override.activeCounter === 'task_queue' || override.activeCounter === 'jobs_running') {
        next.activeCounter = override.activeCounter;
        return;
    }
    errors.push(`[${stage}] activeCounter must be 'task_queue' or 'jobs_running'`);
}

function applyJobsRunningLikeOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    if (override.jobsRunningLike === undefined) {return;}
    if (typeof override.jobsRunningLike === 'string' && override.jobsRunningLike.trim()) {
        next.jobsRunningLike = override.jobsRunningLike.trim();
        return;
    }
    errors.push(`[${stage}] jobsRunningLike must be a non-empty string`);
}

function applyBatchLimitOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    if (override.batchLimit === undefined) {return;}
    if (typeof override.batchLimit === 'number' && Number.isFinite(override.batchLimit) && override.batchLimit >= 1) {
        next.batchLimit = Math.floor(override.batchLimit);
        return;
    }
    errors.push(`[${stage}] batchLimit must be >= 1`);
}

function applyHeavyBatchingOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    if (override.useHeavyBatching === undefined) {return;}
    if (typeof override.useHeavyBatching === 'boolean') {
        next.useHeavyBatching = override.useHeavyBatching;
        return;
    }
    errors.push(`[${stage}] useHeavyBatching must be boolean`);
}

function applyStageOverride(next: StagePolicy, override: StagePolicyOverride, stage: QueueStage, errors: string[]) {
    applyOrderOverride(next, override, stage, errors);
    applyGateOverride(next, override, stage, errors);
    applyActiveCounterOverride(next, override, stage, errors);
    applyJobsRunningLikeOverride(next, override, stage, errors);
    applyBatchLimitOverride(next, override, stage, errors);
    applyHeavyBatchingOverride(next, override, stage, errors);

    if (override.dispatch !== undefined) {
        next.dispatch = applyDispatchOverride(next.dispatch, override.dispatch, stage, errors);
    }
}

function validateJobsRunningDependency(next: StagePolicy, base: StagePolicy, errors: string[]) {
    if (next.activeCounter !== 'jobs_running' || next.jobsRunningLike) {return;}
    errors.push(`[${base.stage}] activeCounter='jobs_running' requires jobsRunningLike`);
    next.activeCounter = base.activeCounter;
    next.jobsRunningLike = base.jobsRunningLike;
}

function buildPolicyFromOverride(
    base: StagePolicy,
    source: Record<string, unknown>,
    errors: string[]
): StagePolicy {
    const next = clonePolicy(base);
    const rawOverride = source[base.stage];

    if (rawOverride !== undefined) {
        if (isRecord(rawOverride)) {
            applyStageOverride(next, rawOverride as StagePolicyOverride, base.stage, errors);
        } else {
            errors.push(`[${base.stage}] override must be an object`);
        }
    }

    validateJobsRunningDependency(next, base, errors);
    return next;
}

export function resolveStagePoliciesFromSetting(
    rawSetting: string,
    basePolicies: StagePolicy[] = STAGE_POLICIES
): { policies: StagePolicy[]; errors: string[] } {
    const clonedBasePolicies = basePolicies.map(clonePolicy);

    if (!rawSetting.trim()) {
        return { policies: sortStagePolicies(clonedBasePolicies), errors: [] };
    }

    const parsed = parseOverrideSource(rawSetting);
    if (!parsed.source) {
        return { policies: sortStagePolicies(clonedBasePolicies), errors: parsed.errors };
    }

    const errors = [...parsed.errors];
    const allowedStages = clonedBasePolicies.map(policy => policy.stage);
    collectUnknownStageOverrideErrors(parsed.source, allowedStages, errors);
    const policies = sortStagePolicies(
        clonedBasePolicies.map(base => buildPolicyFromOverride(base, parsed.source as Record<string, unknown>, errors))
    );
    return { policies, errors };
}

export function resolveWorkflowDefinitionFromSettings(
    stageOverridesRaw: string,
    moduleSettingRaw: string
): { policies: StagePolicy[]; transitionRules: QueueTransitionRule[]; errors: string[] } {
    const moduleResolution = resolveWorkflowModulesFromSetting(moduleSettingRaw);
    const basePolicies = buildStagePoliciesFromModules(moduleResolution.modules);
    const transitionRules = buildTransitionRulesFromModules(moduleResolution.modules);
    const stageResolution = resolveStagePoliciesFromSetting(stageOverridesRaw, basePolicies);

    return {
        policies: stageResolution.policies,
        transitionRules,
        errors: [...moduleResolution.errors, ...stageResolution.errors]
    };
}

export function getQueueTransitionMediaId(event: DomainEvent, rule?: QueueTransitionRule): string | null {
    const payload = event as unknown as Record<string, unknown>;

    if (rule?.mediaIdField) {
        const value = payload[rule.mediaIdField];
        return typeof value === 'string' && value.length > 0 ? value : null;
    }

    const mediaId = payload.mediaId;
    if (typeof mediaId === 'string' && mediaId.length > 0) {return mediaId;}

    const assetId = payload.assetId;
    if (typeof assetId === 'string' && assetId.length > 0) {return assetId;}

    return null;
}
