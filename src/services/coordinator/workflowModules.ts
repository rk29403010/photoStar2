import type { WorkflowModuleDefinition } from './workflows';

const BUILTIN_WORKFLOW_MODULES: WorkflowModuleDefinition[] = [
    {
        id: 'ingest_previews',
        description: 'Ingest and preview queueing',
        enabledByDefault: true,
        stagePolicies: [
            {
                stage: 'previews',
                order: 10,
                gate: 'strict',
                activeCounter: 'task_queue',
                batchLimit: 100,
                dispatch: { kind: 'media_batch', event: 'PreviewRequested', reason: 'ingest' }
            }
        ],
        transitionRules: [
            {
                id: 'ingest-auto-previews',
                eventType: 'MediaDiscovered',
                condition: 'auto_preview_on',
                actions: [{ kind: 'queue_upsert', stage: 'previews' }],
                triggerEvaluate: true
            },
            {
                id: 'preview-progression-complete',
                eventType: 'PreviewGenerated',
                actions: [{ kind: 'queue_complete', stage: 'previews' }],
                triggerEvaluate: true
            }
        ]
    },
    {
        id: 'face_pipeline',
        description: 'Face detection and clustering',
        enabledByDefault: true,
        stagePolicies: [
            {
                stage: 'detection',
                order: 20,
                gate: 'strict',
                activeCounter: 'task_queue',
                batchLimit: 100,
                useHeavyBatching: true,
                dispatch: { kind: 'media_batch', event: 'FaceDetectionRequested' }
            },
            {
                stage: 'clustering',
                order: 30,
                gate: 'opportunistic',
                activeCounter: 'jobs_running',
                jobsRunningLike: 'cluster-%',
                dispatch: { kind: 'signal', event: 'FaceClusteringRequested', completePendingRowsBeforeEmit: true }
            }
        ],
        transitionRules: [
            {
                id: 'detection-no-preview',
                eventType: 'MediaDiscovered',
                condition: 'auto_preview_off',
                actions: [{ kind: 'queue_upsert', stage: 'detection' }],
                triggerEvaluate: true
            },
            {
                id: 'detection-from-preview',
                eventType: 'PreviewGenerated',
                actions: [{ kind: 'queue_upsert', stage: 'detection' }],
                triggerEvaluate: true
            },
            {
                id: 'detection-progression',
                eventType: 'FacesDetected',
                actions: [{ kind: 'queue_complete', stage: 'detection' }],
                triggerEvaluate: true
            },
            {
                id: 'clustering-from-detection',
                eventType: 'FaceEmbeddingGenerated',
                actions: [
                    { kind: 'queue_upsert', stage: 'clustering' }
                ],
                triggerEvaluate: true
            }
        ]
    },
    {
        id: 'safety_pipeline',
        description: 'Sensitive content scanning',
        enabledByDefault: true,
        stagePolicies: [
            {
                stage: 'sensitive_scan',
                order: 50,
                gate: 'opportunistic',
                activeCounter: 'jobs_running',
                jobsRunningLike: 'sensitive-%',
                batchLimit: 200,
                useHeavyBatching: true,
                dispatch: { kind: 'media_batch', event: 'SensitiveScanRequested' }
            }
        ],
        transitionRules: [
            {
                id: 'sensitive-no-preview',
                eventType: 'MediaDiscovered',
                condition: 'auto_preview_off',
                actions: [{ kind: 'queue_upsert', stage: 'sensitive_scan', priority: -10 }],
                triggerEvaluate: true
            },
            {
                id: 'sensitive-from-preview',
                eventType: 'PreviewGenerated',
                actions: [{ kind: 'queue_upsert', stage: 'sensitive_scan', priority: -10 }],
                triggerEvaluate: true
            },
            {
                id: 'sensitive-complete',
                eventType: 'SensitivityScored',
                actions: [{ kind: 'queue_complete', stage: 'sensitive_scan' }],
                triggerEvaluate: false
            }
        ]
    },
    {
        id: 'ai_metadata_pipeline',
        description: 'AI metadata extraction',
        enabledByDefault: false,
        status: 'legacy',
        replacedByModuleId: 'ai_metadata_v2_pipeline',
        storageCompatibility: 'reuse_existing_results',
        monitoringCompatibility: 'merge_legacy_and_replacement',
        rateLimitStrategy: 'dynamic_tier',
        stagePolicies: [
            {
                stage: 'ai_metadata_3f',
                order: 60,
                gate: 'strict',
                activeCounter: 'jobs_running',
                jobsRunningLike: 'ai_meta_3f-%',
                batchLimit: 100,
                useHeavyBatching: true,
                dispatch: { kind: 'media_batch', event: 'AiMetadataRequested', workerMode: 'fresh' }
            },
            {
                stage: 'ai_metadata_31p',
                order: 61,
                gate: 'opportunistic',
                activeCounter: 'jobs_running',
                jobsRunningLike: 'ai_meta_31p-%',
                batchLimit: 50,
                useHeavyBatching: true,
                dispatch: { kind: 'media_batch', event: 'AiMetadataRequested', workerMode: 'pro_pending' }
            }
        ],
        transitionRules: [
            {
                id: 'ai-meta-no-preview',
                eventType: 'MediaDiscovered',
                condition: 'auto_preview_off',
                actions: [{ kind: 'queue_upsert', stage: 'ai_metadata_3f', priority: -20 }],
                triggerEvaluate: true
            },
            {
                id: 'ai-meta-from-preview',
                eventType: 'PreviewGenerated',
                actions: [{ kind: 'queue_upsert', stage: 'ai_metadata_3f', priority: -20 }],
                triggerEvaluate: true
            }
        ]
    },
    {
        id: 'ai_metadata_v2_pipeline',
        description: 'Replacement AI metadata extraction with owned batches and declarative completion',
        enabledByDefault: true,
        status: 'active',
        replacesModuleIds: ['ai_metadata_pipeline'],
        storageCompatibility: 'reuse_existing_results',
        monitoringCompatibility: 'merge_legacy_and_replacement',
        rateLimitStrategy: 'dynamic_tier',
        stagePolicies: [
            {
                stage: 'ai_metadata_v2_3f',
                order: 60,
                gate: 'strict',
                activeCounter: 'jobs_running',
                jobsRunningLike: 'ai_meta_v2_3f-%',
                batchLimit: 10,
                useHeavyBatching: true,
                batchOwnership: 'job_id',
                jobIdPrefix: 'ai_meta_v2_3f',
                dispatch: { kind: 'media_batch', event: 'AiMetadataV2Requested', workerMode: 'fresh' }
            },
            {
                stage: 'ai_metadata_v2_31p',
                order: 61,
                gate: 'opportunistic',
                activeCounter: 'jobs_running',
                jobsRunningLike: 'ai_meta_v2_31p-%',
                batchLimit: 5,
                useHeavyBatching: true,
                batchOwnership: 'job_id',
                jobIdPrefix: 'ai_meta_v2_31p',
                dispatch: { kind: 'media_batch', event: 'AiMetadataV2Requested', workerMode: 'pro_pending' }
            }
        ],
        transitionRules: [
            {
                id: 'ai-meta-v2-no-preview',
                eventType: 'MediaDiscovered',
                condition: 'auto_preview_off',
                actions: [{ kind: 'queue_upsert', stage: 'ai_metadata_v2_3f', priority: -20 }],
                triggerEvaluate: true
            },
            {
                id: 'ai-meta-v2-from-preview',
                eventType: 'PreviewGenerated',
                actions: [{ kind: 'queue_upsert', stage: 'ai_metadata_v2_3f', priority: -20 }],
                triggerEvaluate: true
            },
            {
                id: 'ai-meta-v2-upgrade-queued',
                eventType: 'AiMetadataV2UpgradeQueued',
                actions: [{ kind: 'queue_upsert', stage: 'ai_metadata_v2_31p', priority: -30 }],
                triggerEvaluate: true
            },
            {
                id: 'ai-meta-v2-fresh-complete',
                eventType: 'AiMetadataV2FreshCompleted',
                actions: [{ kind: 'queue_complete', stage: 'ai_metadata_v2_3f' }],
                triggerEvaluate: true
            },
            {
                id: 'ai-meta-v2-pro-complete',
                eventType: 'AiMetadataV2ProCompleted',
                actions: [{ kind: 'queue_complete', stage: 'ai_metadata_v2_31p' }],
                triggerEvaluate: true
            }
        ]
    }
];

const runtimeWorkflowModules = new Map<string, WorkflowModuleDefinition>();
const LEGACY_WORKFLOW_MODULE_ALIASES = new Map<string, string>([
    ['ai_metadata_pipeline', 'ai_metadata_v2_pipeline']
]);

function cloneDispatch(dispatch: WorkflowModuleDefinition['stagePolicies'][number]['dispatch']) {
    return { ...dispatch };
}

function cloneModule(module: WorkflowModuleDefinition): WorkflowModuleDefinition {
    return {
        ...module,
        replacesModuleIds: module.replacesModuleIds ? [...module.replacesModuleIds] : undefined,
        stagePolicies: module.stagePolicies.map(policy => ({ ...policy, dispatch: cloneDispatch(policy.dispatch) })),
        transitionRules: module.transitionRules.map(rule => ({
            ...rule,
            actions: rule.actions.map(action => ({ ...action }))
        }))
    };
}

function getWorkflowModuleCatalog(): WorkflowModuleDefinition[] {
    const byId = new Map<string, WorkflowModuleDefinition>();

    for (const module of BUILTIN_WORKFLOW_MODULES) {
        byId.set(module.id, cloneModule(module));
    }

    for (const [id, module] of runtimeWorkflowModules.entries()) {
        byId.set(id, cloneModule(module));
    }

    return Array.from(byId.values());
}

function getDefaultEnabledModuleIds(catalog: WorkflowModuleDefinition[]): Set<string> {
    return new Set(catalog.filter(module => module.enabledByDefault !== false).map(module => module.id));
}

function parseStringArray(value: unknown, label: string, errors: string[]): string[] | null {
    if (value === undefined) {return null;}
    if (!Array.isArray(value)) {
        errors.push(`${label} must be an array of strings`);
        return null;
    }

    const next: string[] = [];
    for (const item of value) {
        if (typeof item !== 'string') {
            errors.push(`${label} must contain only strings`);
            return null;
        }
        const trimmed = item.trim();
        if (trimmed) {next.push(trimmed);}
    }
    return next;
}

function normalizeWorkflowModuleIds(moduleIds: string[] | null): string[] | null {
    if (!moduleIds) {
        return null;
    }

    return moduleIds.map((moduleId) => LEGACY_WORKFLOW_MODULE_ALIASES.get(moduleId) || moduleId);
}

function parseModuleSelection(
    rawSetting: string
): { onlyModules: string[] | null; enabledModules: string[] | null; disabledModules: string[] | null; errors: string[] } {
    if (!rawSetting.trim()) {
        return { onlyModules: null, enabledModules: null, disabledModules: null, errors: [] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawSetting);
    } catch (err) {
        return { onlyModules: null, enabledModules: null, disabledModules: null, errors: [`Invalid workflow modules JSON: ${String(err)}`] };
    }

    const errors: string[] = [];
    if (Array.isArray(parsed)) {
        const onlyModules = normalizeWorkflowModuleIds(parseStringArray(parsed, 'workflow modules array', errors));
        return { onlyModules, enabledModules: null, disabledModules: null, errors };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push('workflow_modules_json must be either an array or an object');
        return { onlyModules: null, enabledModules: null, disabledModules: null, errors };
    }

    const source = parsed as Record<string, unknown>;
    const onlyModules = normalizeWorkflowModuleIds(parseStringArray(source.onlyModules, 'onlyModules', errors));
    const enabledModules = normalizeWorkflowModuleIds(parseStringArray(source.enabledModules, 'enabledModules', errors));
    const disabledModules = normalizeWorkflowModuleIds(parseStringArray(source.disabledModules, 'disabledModules', errors));
    return { onlyModules, enabledModules, disabledModules, errors };
}

function collectUnknownModuleErrors(moduleIds: string[], knownIds: Set<string>, fieldName: string, errors: string[]) {
    for (const moduleId of moduleIds) {
        if (!knownIds.has(moduleId)) {
            errors.push(`Unknown workflow module '${moduleId}' in ${fieldName}`);
        }
    }
}

function dedupeModuleIds(moduleIds: string[]): string[] {
    return Array.from(new Set(moduleIds));
}

export function registerWorkflowModule(module: WorkflowModuleDefinition): void {
    if (!module.id.trim()) {
        throw new Error('Workflow module id must be non-empty');
    }
    runtimeWorkflowModules.set(module.id, cloneModule(module));
}

export function listWorkflowModules(): WorkflowModuleDefinition[] {
    return getWorkflowModuleCatalog().map(cloneModule);
}

export function getDefaultWorkflowModules(): WorkflowModuleDefinition[] {
    const catalog = getWorkflowModuleCatalog();
    const defaultEnabled = getDefaultEnabledModuleIds(catalog);
    return catalog.filter(module => defaultEnabled.has(module.id)).map(cloneModule);
}

export function resolveWorkflowModulesFromSetting(
    rawSetting: string
): { modules: WorkflowModuleDefinition[]; errors: string[] } {
    const catalog = getWorkflowModuleCatalog();
    const knownModuleIds = new Set(catalog.map(module => module.id));
    const selection = parseModuleSelection(rawSetting);
    const errors = [...selection.errors];

    const enabledSet = new Set<string>(getDefaultEnabledModuleIds(catalog));

    if (selection.onlyModules) {
        const onlyModuleIds = dedupeModuleIds(selection.onlyModules);
        collectUnknownModuleErrors(onlyModuleIds, knownModuleIds, 'onlyModules', errors);
        enabledSet.clear();
        for (const moduleId of onlyModuleIds) {
            if (knownModuleIds.has(moduleId)) {enabledSet.add(moduleId);}
        }
    } else {
        const enabledModuleIds = dedupeModuleIds(selection.enabledModules || []);
        const disabledModuleIds = dedupeModuleIds(selection.disabledModules || []);

        collectUnknownModuleErrors(enabledModuleIds, knownModuleIds, 'enabledModules', errors);
        collectUnknownModuleErrors(disabledModuleIds, knownModuleIds, 'disabledModules', errors);

        for (const moduleId of enabledModuleIds) {
            if (knownModuleIds.has(moduleId)) {enabledSet.add(moduleId);}
        }
        for (const moduleId of disabledModuleIds) {
            enabledSet.delete(moduleId);
        }
    }

    const modules = catalog
        .filter(module => enabledSet.has(module.id))
        .map(cloneModule);

    return { modules, errors };
}
