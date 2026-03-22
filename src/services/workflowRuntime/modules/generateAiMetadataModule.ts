import type { DatabaseManager } from '../../../data/db';
import type { DomainEvent } from '../../events/types';
import {
    getLiveAiConfigurationError,
    generateLiveAiMetadata,
    persistAiMetadataResult,
} from '../../aiMetadata/liveRuntime';
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
    aiRuntime?: {
        generateLiveMetadata: (params: {
            dbManager: DatabaseManager;
            row: ParsedAiMetadataRow;
            imageStrategy: 'overview_only' | 'overview_plus_tiles';
            eventSink?: { emit: (event: DomainEvent) => void };
        }) => Promise<StoredAiMetadataResult>;
    };
}

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
    liveRuntime: NonNullable<GenerateAiMetadataModuleOptions['aiRuntime']>;
    row: ParsedAiMetadataRow;
}): Promise<StoredAiMetadataResult> {
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
        eventSink: params.eventBus,
    });
}

export function createGenerateAiMetadataModule(options: GenerateAiMetadataModuleOptions): ModuleDefinition {
    const liveRuntime = options.aiRuntime ?? {
        generateLiveMetadata: generateLiveAiMetadata,
    };

    return {
        id: 'runtime.generate_ai_metadata',
        version: 1,
        capability: 'external_api',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' }],
        run: async (context) => {
            const aiMode = resolveAiMode(context.parameters.aiMode);
            const imageStrategy = resolveImageStrategy(context.parameters.imageStrategy);

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

            const result = await generateMetadataResult({
                aiMode,
                assetId: context.subject.subjectId,
                dbManager: options.dbManager,
                eventBus: options.eventBus,
                imageStrategy,
                liveRuntime,
                row,
            });

            persistAiMetadataResult({
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
