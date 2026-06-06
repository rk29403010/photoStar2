import type { DatabaseManager } from '../../../../data/db';
import type { DomainEvent } from '../../../events/types';
import {
    getLiveAiConfigurationError,
    generateLiveAiMetadata,
    type LiveMetadataEvidence,
} from './liveRuntime';
import {
    persistAiMetadataResult,
    persistPhotoMetadataEvidence,
} from './liveEvidencePersistence';
import type {
    ParsedAiMetadataRow,
    StoredAiMetadataResult,
} from './geminiTypes';
import type { ModuleDefinition, RuntimeModuleContext, RuntimeModuleRunResult } from '../../contracts';
import { generateAiMetadataParamsSchema } from './schema';

function buildMetadataPayload(assetId: string, mode: 'mock' | 'live'): Record<string, unknown> {
    return {
        mode,
        caption: mode === 'mock' ? `Mock caption for ${assetId}` : `Live-ready caption for ${assetId}`,
        tags: mode === 'mock' ? ['mock-tag'] : ['live-tag'],
        notes: mode === 'mock' ? 'Deterministic mock response' : 'Deterministic live placeholder response',
    };
}

export type GenerateAiMetadataModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: DomainEvent) => void;
    };
    liveMetadataTimeoutMs?: number;
    aiRuntime?: {
        generateLiveMetadata: (params: {
            dbManager: DatabaseManager;
            row: ParsedAiMetadataRow;
            imageStrategy: 'overview_only' | 'overview_plus_tiles';
            metadataPass: 'scout' | 'refine';
            eventSink?: { emit: (event: DomainEvent) => void };
            moduleId?: string;
            signal?: AbortSignal;
        }) => Promise<StoredAiMetadataResult | LiveMetadataEvidence>;
    };
}

const DEFAULT_SCOUT_LIVE_METADATA_TIMEOUT_MS = 120_000;
const DEFAULT_REFINE_LIVE_METADATA_TIMEOUT_MS = 300_000;

function loadAssetRow(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): ParsedAiMetadataRow | null {
    const row = db.prepare(`
        SELECT a.id, a.original_path, a.width, a.height, a.sensitivity_score, am.sensitivity_status
        FROM assets a
        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
        WHERE a.id = ?
    `).get(assetId) as ParsedAiMetadataRow | undefined;

    return row ?? null;
}

function isUnsafeRow(row: ParsedAiMetadataRow): boolean {
    return row.sensitivity_status === 'unsafe'
        || (row.sensitivity_status !== 'safe' && row.sensitivity_score !== null && row.sensitivity_score > 75);
}



export function resolveLiveMetadataTimeoutMs(params: {
    metadataPass: 'scout' | 'refine';
    configuredTimeoutMs?: number;
}): number {
    if (typeof params.configuredTimeoutMs === 'number') {
        return params.configuredTimeoutMs;
    }

    return params.metadataPass === 'refine'
        ? DEFAULT_REFINE_LIVE_METADATA_TIMEOUT_MS
        : DEFAULT_SCOUT_LIVE_METADATA_TIMEOUT_MS;
}

function assertLiveAiConfiguration(
    options: GenerateAiMetadataModuleOptions,
    runId: string,
    emittedRunIds?: Set<string>,
): void {
    const configurationError = getLiveAiConfigurationError(options.dbManager);
    if (!configurationError) {
        return;
    }

    if (!emittedRunIds?.has(runId)) {
        if (emittedRunIds) {
            emittedRunIds.add(runId);
        }
        options.eventBus?.emit({
            type: 'AiMetadataConfigurationError',
            workflowRunId: runId,
            nodeId: 'generate-ai-metadata',
            message: configurationError,
        });
    }
    throw new Error(configurationError);
}

async function generateMetadataResult(params: {
    aiMode: 'mock' | 'live';
    assetId: string;
    dbManager: DatabaseManager;
    eventBus?: GenerateAiMetadataModuleOptions['eventBus'];
    imageStrategy: 'overview_only' | 'overview_plus_tiles';
    metadataPass: 'scout' | 'refine';
    moduleId: string;
    liveRuntime: NonNullable<GenerateAiMetadataModuleOptions['aiRuntime']>;
    row: ParsedAiMetadataRow;
    signal?: AbortSignal;
}): Promise<StoredAiMetadataResult | LiveMetadataEvidence> {
    if (params.aiMode === 'mock') {
        return {
            provider: 'runtime_stub',
            modelVersion: '1.0',
            data: buildMetadataPayload(params.assetId, params.aiMode),
        };
    }

    return params.liveRuntime.generateLiveMetadata({
        dbManager: params.dbManager,
        row: params.row,
        imageStrategy: params.imageStrategy,
        metadataPass: params.metadataPass,
        eventSink: params.eventBus,
        moduleId: params.moduleId,
        signal: params.signal,
    });
}

async function withLiveMetadataTimeout<T>(
    operationFactory: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    assetId: string,
): Promise<T> {
    const executeWithTimeout = async () => {
        const controller = new AbortController();
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                controller.abort();
                reject(new Error(`AI metadata timed out after ${timeoutMs}ms for asset '${assetId}'`));
            }, timeoutMs);
        });

        try {
            return await Promise.race([
                operationFactory(controller.signal),
                timeoutPromise,
            ]);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`AI metadata timed out after ${timeoutMs}ms for asset '${assetId}'`);
            }
            throw error;
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
    };

    try {
        return await executeWithTimeout();
    } catch (error) {
        if (error instanceof Error && error.message.includes('timed out')) {
            console.warn(`[AI Metadata] Retrying asset ${assetId} after timeout.`);
            return executeWithTimeout();
        }
        throw error;
    }
}

function isLiveMetadataResult(result: StoredAiMetadataResult | LiveMetadataEvidence): result is LiveMetadataEvidence {
    return 'metadataBlock' in result && 'metadataSourceKind' in result;
}

function persistMachineMetadataEvidence(params: {
    dbManager: DatabaseManager;
    assetId: string;
    row: ParsedAiMetadataRow;
    result: StoredAiMetadataResult | LiveMetadataEvidence;
}): void {
    if (isLiveMetadataResult(params.result)) {
        persistPhotoMetadataEvidence({
            dbManager: params.dbManager,
            assetId: params.assetId,
            sourceKind: params.result.metadataSourceKind,
            provider: params.result.provider,
            modelVersion: params.result.modelVersion,
            metadataBlock: params.result.metadataBlock,
            imageDimensions: {
                width: params.result.imageWidth ?? params.row.width ?? null,
                height: params.result.imageHeight ?? params.row.height ?? null,
            },
            approvedKeywords: params.result.approvedKeywords,
            tagProposals: params.result.tagProposals,
        });
    }

    persistAiMetadataResult({
        dbManager: params.dbManager,
        assetId: params.assetId,
        provider: params.result.provider,
        modelVersion: params.result.modelVersion,
        data: params.result.data,
    });
}

async function runGenerateAiMetadata(
    context: RuntimeModuleContext,
    options: GenerateAiMetadataModuleOptions,
    params: {
        id: string;
        imageStrategy?: 'overview_only' | 'overview_plus_tiles';
        metadataPass?: 'scout' | 'refine';
    },
    liveRuntime: NonNullable<GenerateAiMetadataModuleOptions['aiRuntime']>,
    emittedRunIds: Set<string>,
): Promise<RuntimeModuleRunResult> {
    const validatedParams = generateAiMetadataParamsSchema.parse(context.parameters);
    const aiMode = validatedParams.aiMode;
    const metadataPass = params.metadataPass ?? validatedParams.metadataPass ?? 'scout';
    const imageStrategy = params.imageStrategy ?? validatedParams.imageStrategy ?? 'overview_only';
    
    const liveMetadataTimeoutMs = resolveLiveMetadataTimeoutMs({
        metadataPass,
        configuredTimeoutMs: options.liveMetadataTimeoutMs,
    });

    if (aiMode === 'off') {
        return { outputs: [] };
    }

    if (aiMode === 'live') {
        assertLiveAiConfiguration(options, context.runId, emittedRunIds);
    }

    const db = options.dbManager.getDb();
    const row = loadAssetRow(db, context.subject.subjectId);
    if (!row || isUnsafeRow(row)) {
        return { outputs: [] };
    }

    // Idempotency check: skip if we already have this pass's evidence
    const existingBlocks = db.prepare(`SELECT id FROM photo_metadata_blocks WHERE asset_id = ? AND source_kind = ?`).get(context.subject.subjectId, metadataPass);
    if (existingBlocks) {
        return { outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }] };
    }

    const result = await withLiveMetadataTimeout(
        (signal) => generateMetadataResult({
            aiMode,
            assetId: context.subject.subjectId,
            dbManager: options.dbManager,
            eventBus: options.eventBus,
            imageStrategy,
            metadataPass,
            moduleId: params.id,
            liveRuntime,
            row,
            signal,
        }),
        liveMetadataTimeoutMs,
        context.subject.subjectId,
    );

    persistMachineMetadataEvidence({
        dbManager: options.dbManager,
        assetId: context.subject.subjectId,
        row,
        result,
    });
    options.eventBus?.emit({
        type: 'AssetUpdated',
        assetId: context.subject.subjectId,
    });
    return { outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }] };
}

function createBaseGenerateAiMetadataModule(
    options: GenerateAiMetadataModuleOptions,
    params: {
        id: string;
        estimatedCostPerCall: number;
        imageStrategy?: 'overview_only' | 'overview_plus_tiles';
        metadataPass?: 'scout' | 'refine';
    }
): ModuleDefinition {
    const liveRuntime = options.aiRuntime ?? {
        generateLiveMetadata: generateLiveAiMetadata,
    };
    const emittedRunIds = new Set<string>();

    return {
        id: params.id,
        version: 1,
        capability: 'external_api',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }],
        estimatedCostPerCall: params.estimatedCostPerCall,
        run: (context) => runGenerateAiMetadata(context, options, params, liveRuntime, emittedRunIds),
        estimate: async (context) => {
            const validatedParams = generateAiMetadataParamsSchema.parse(context.parameters);
            const aiMode = validatedParams.aiMode;
            const cost = aiMode === 'live' ? params.estimatedCostPerCall : 0;
            return {
                outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }],
                cost,
            };
        },
    };
}

export function createGenerateAiMetadataScoutModule(options: GenerateAiMetadataModuleOptions): ModuleDefinition {
    return createBaseGenerateAiMetadataModule(options, {
        id: 'runtime.generate_ai_metadata_scout',
        estimatedCostPerCall: 0.0008,
        imageStrategy: 'overview_only',
        metadataPass: 'scout',
    });
}

export function createGenerateAiMetadataRefineModule(options: GenerateAiMetadataModuleOptions): ModuleDefinition {
    return createBaseGenerateAiMetadataModule(options, {
        id: 'runtime.generate_ai_metadata_refine',
        estimatedCostPerCall: 0.0022,
        imageStrategy: 'overview_plus_tiles',
        metadataPass: 'refine',
    });
}

export function createGenerateAiMetadataModule(options: GenerateAiMetadataModuleOptions): ModuleDefinition {
    return createBaseGenerateAiMetadataModule(options, {
        id: 'runtime.generate_ai_metadata_scout',
        estimatedCostPerCall: 0.0008,
    });
}
