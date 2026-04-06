import type { DatabaseManager } from '../../../data/db';
import type { DomainEvent } from '../../events/types';
import {
    getLiveAiConfigurationError,
    generateLiveAiMetadata,
    type LiveMetadataEvidence,
} from '../../aiMetadata/liveRuntime';
import {
    persistAiMetadataResult,
    persistPhotoMetadataEvidence,
} from '../../aiMetadata/liveEvidencePersistence';
import type {
    ParsedAiMetadataRow,
    StoredAiMetadataResult,
} from '../../aiMetadata/geminiTypes';
import type { ModuleDefinition } from '../contracts';

function buildMetadataPayload(assetId: string, mode: 'mock' | 'live'): Record<string, unknown> {
    return {
        mode,
        caption: mode === 'mock' ? `Mock caption for ${assetId}` : `Live-ready caption for ${assetId}`,
        tags: mode === 'mock' ? ['mock-tag'] : ['live-tag'],
        notes: mode === 'mock' ? 'Deterministic mock response' : 'Deterministic live placeholder response',
    };
}

export interface GenerateAiMetadataModuleOptions {
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
        }) => Promise<StoredAiMetadataResult | LiveMetadataEvidence>;
    };
}

const DEFAULT_LIVE_METADATA_TIMEOUT_MS = 120_000;

function loadAssetRow(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): ParsedAiMetadataRow | null {
    const row = db.prepare(`
        SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
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

function resolveAiMode(value: unknown): 'mock' | 'live' | 'off' {
    if (value === 'mock' || value === 'live') {
        return value;
    }
    return 'off';
}

function resolveImageStrategy(value: unknown): 'overview_only' | 'overview_plus_tiles' {
    return value === 'overview_plus_tiles' ? 'overview_plus_tiles' : 'overview_only';
}

function resolveMetadataPass(value: unknown): 'scout' | 'refine' {
    return value === 'refine' ? 'refine' : 'scout';
}

function assertLiveAiConfiguration(
    options: GenerateAiMetadataModuleOptions,
    runId: string,
): void {
    const configurationError = getLiveAiConfigurationError(options.dbManager);
    if (!configurationError) {
        return;
    }

    options.eventBus?.emit({
        type: 'AiMetadataConfigurationError',
        workflowRunId: runId,
        nodeId: 'generate-ai-metadata',
        message: configurationError,
    });
    throw new Error(configurationError);
}

async function generateMetadataResult(params: {
    aiMode: 'mock' | 'live';
    assetId: string;
    dbManager: DatabaseManager;
    eventBus?: GenerateAiMetadataModuleOptions['eventBus'];
    imageStrategy: 'overview_only' | 'overview_plus_tiles';
    metadataPass: 'scout' | 'refine';
    liveRuntime: NonNullable<GenerateAiMetadataModuleOptions['aiRuntime']>;
    row: ParsedAiMetadataRow;
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
    });
}

async function withLiveMetadataTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    assetId: string,
): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            operation,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`AI metadata timed out after ${timeoutMs}ms for asset '${assetId}'`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
        }
    }
}

function isLiveMetadataResult(result: StoredAiMetadataResult | LiveMetadataEvidence): result is LiveMetadataEvidence {
    return 'metadataBlock' in result && 'metadataSourceKind' in result;
}

function persistMachineMetadataEvidence(params: {
    dbManager: DatabaseManager;
    assetId: string;
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

export function createGenerateAiMetadataModule(options: GenerateAiMetadataModuleOptions): ModuleDefinition {
    const liveRuntime = options.aiRuntime ?? {
        generateLiveMetadata: generateLiveAiMetadata,
    };
    const liveMetadataTimeoutMs = options.liveMetadataTimeoutMs ?? DEFAULT_LIVE_METADATA_TIMEOUT_MS;

    return {
        id: 'runtime.generate_ai_metadata',
        version: 1,
        capability: 'external_api',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }],
        run: async (context) => {
            const aiMode = resolveAiMode(context.parameters.aiMode);
            const imageStrategy = resolveImageStrategy(context.parameters.imageStrategy);
            const metadataPass = resolveMetadataPass(context.parameters.metadataPass);

            if (aiMode === 'off') {
                return { outputs: [] };
            }

            if (aiMode === 'live') {
                assertLiveAiConfiguration(options, context.runId);
            }

            const db = options.dbManager.getDb();
            const row = loadAssetRow(db, context.subject.subjectId);
            if (!row || isUnsafeRow(row)) {
                return { outputs: [] };
            }

            const result = await withLiveMetadataTimeout(
                generateMetadataResult({
                    aiMode,
                    assetId: context.subject.subjectId,
                    dbManager: options.dbManager,
                    eventBus: options.eventBus,
                    imageStrategy,
                    metadataPass,
                    liveRuntime,
                    row,
                }),
                liveMetadataTimeoutMs,
                context.subject.subjectId,
            );

            persistMachineMetadataEvidence({
                dbManager: options.dbManager,
                assetId: context.subject.subjectId,
                result,
            });
            options.eventBus?.emit({
                type: 'AssetUpdated',
                assetId: context.subject.subjectId,
            });
            return { outputs: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }] };
        },
    };
}
