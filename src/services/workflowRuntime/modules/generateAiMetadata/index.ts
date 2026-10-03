import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../../../data/db';
import type { DomainEvent } from '../../../events/types';
import type { AnalysisAssetRow } from '../../../photoAnalysis/localInputs';
import { persistAnalysisRun } from '../../../photoAnalysis/repository';
import type { ModuleDefinition } from '../../contracts';
import { generateLiveAiMetadata, getLiveAiConfigurationError } from './liveRuntime';
import { generateAiMetadataParamsSchema } from './schema';

export type GenerateAiMetadataModuleOptions = {
    dbManager: DatabaseManager; eventBus?: { emit(event: DomainEvent): void }; liveMetadataTimeoutMs?: number;
    aiRuntime?: { generateLiveMetadata: typeof generateLiveAiMetadata };
};
export type GenerateAiMetadataModuleSpec = { id: string; estimatedCostPerCall: number; metadataPass?: 'scout' | 'refine' };

export function resolveLiveMetadataTimeoutMs(params: { metadataPass: 'scout' | 'refine'; configuredTimeoutMs?: number }): number {
    return params.configuredTimeoutMs ?? (params.metadataPass === 'refine' ? 300_000 : 120_000);
}

function loadAsset(dbManager: DatabaseManager, assetId: string): AnalysisAssetRow | undefined {
    return dbManager.getDb().prepare(`SELECT a.id, a.original_path, a.width, a.height, a.sensitivity_score, am.sensitivity_status
        FROM assets a LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid WHERE a.id = ?`).get(assetId) as AnalysisAssetRow | undefined;
}

function persistMock(dbManager: DatabaseManager, assetId: string): void {
    const sourceId = `mock:${randomUUID()}`;
    persistAnalysisRun(dbManager, {
        assetId, stage: 'scout', provider: 'runtime_stub', modelVersion: '1', promptVersion: 'mock-1',
        sources: [{ id: sourceId, assetId, kind: 'local', refId: assetId, text: 'Explicit mock analysis' }],
        result: { claims: [{ field: 'caption', subjectId: null, value: `Mock caption for ${assetId}`, kind: 'hypothesis', confidence: 'unknown',
            sourceIds: [sourceId], evidence: [], contradictions: [], supersedesId: null }], regions: [], refinementOpportunities: [] },
    });
}

function isEligibleForAi(row: AnalysisAssetRow | undefined): row is AnalysisAssetRow {
    if (!row || row.sensitivity_status === 'unsafe') { return false; }
    return row.sensitivity_status === 'safe' || (row.sensitivity_score ?? 0) <= 75;
}

async function withinTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('AI analysis timed out')), timeoutMs);
    try {
        return await Promise.race([
            work(controller.signal),
            new Promise<T>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

async function generateMetadata(options: GenerateAiMetadataModuleOptions, row: AnalysisAssetRow,
    parameters: ReturnType<typeof generateAiMetadataParamsSchema.parse>, metadataPass: 'scout' | 'refine'): Promise<void> {
    if (parameters.aiMode === 'mock') { persistMock(options.dbManager, row.id); return; }
    const configurationError = options.aiRuntime ? null : await getLiveAiConfigurationError();
    if (configurationError) { throw new Error(configurationError); }
    const timeout = resolveLiveMetadataTimeoutMs({ metadataPass, configuredTimeoutMs: options.liveMetadataTimeoutMs });
    await withinTimeout(signal => (options.aiRuntime?.generateLiveMetadata ?? generateLiveAiMetadata)({
        dbManager: options.dbManager, row, metadataPass, targets: parameters.targets, signal,
    }), timeout);
}

async function runMetadataModule(options: GenerateAiMetadataModuleOptions, spec: GenerateAiMetadataModuleSpec,
    subjectId: string, parameters: ReturnType<typeof generateAiMetadataParamsSchema.parse>,
    artifact: { kind: 'artifact'; artifactType: 'ai_metadata'; subjectType: 'asset' }) {
    if (parameters.aiMode === 'off') { return { outputs: [] }; }
    const row = loadAsset(options.dbManager, subjectId);
    if (!isEligibleForAi(row)) { return { outputs: [] }; }
    const metadataPass = parameters.metadataPass ?? spec.metadataPass ?? 'scout';
    await generateMetadata(options, row, parameters, metadataPass);
    options.eventBus?.emit({ type: 'AssetUpdated', assetId: row.id });
    return { outputs: [artifact] };
}

export function createGenerateAiMetadataPluginModule(options: GenerateAiMetadataModuleOptions, spec: GenerateAiMetadataModuleSpec): ModuleDefinition {
    const artifact = { kind: 'artifact', artifactType: 'ai_metadata', subjectType: 'asset' } as const;
    return {
        id: spec.id, version: 2, capability: 'external_api', accepts: ['asset'], produces: [artifact], estimatedCostPerCall: spec.estimatedCostPerCall,
        run: context => runMetadataModule(options, spec, context.subject.subjectId,
            generateAiMetadataParamsSchema.parse(context.parameters), artifact),
        estimate: async context => ({ outputs: [artifact], cost: generateAiMetadataParamsSchema.parse(context.parameters).aiMode === 'live' ? spec.estimatedCostPerCall : 0 }),
    };
}
