import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { ModuleDefinition } from '../../../contracts';
import { encodeMaskRaster, saveAssetMaskMetadata } from '../../../../photoEditing/assetMaskMetadata';
import { prepareSegmentationImage } from '../../../../segmentation/imagePreparation';
import { MAX_PERSISTED_SEGMENT_MASKS, retainSegmentationMasks } from '../../../../segmentation/maskPostProcessing';
import type { SegmentationMask, SegmentationProvider } from '../../../../segmentation/contracts';
import { createSegmentationProviders } from '../../../../segmentation/segmentationService';
import type { PhotoMaskMetadataItem } from '../../../../../boundary/contracts/photoEditor';

const MODULE_ID = 'runtime.segment_objects';
const RESULT_TASK = 'object_segmentation';
type SqliteDatabase = ReturnType<DatabaseManager['getDb']>;

export type SegmentObjectsModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: { emit: (event: AssetUpdated) => void };
    providers?: SegmentationProvider[];
};

function boundedMaximum(value: unknown): number {
    const requested = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(requested) ? Math.max(1, Math.min(MAX_PERSISTED_SEGMENT_MASKS, Math.floor(requested))) : MAX_PERSISTED_SEGMENT_MASKS;
}

function selectedProviders(value: unknown, profile: unknown, provided?: SegmentationProvider[]): SegmentationProvider[] {
    const selection = String(value ?? 'fastsam') as 'fastsam' | 'efficientsam' | 'auto' | 'both';
    if (provided) {
        if (selection === 'both') { return provided.filter((provider) => provider.id === 'fastsam' || provider.id === 'efficientsam'); }
        if (selection === 'auto') { return provided.filter((provider) => provider.isAvailable()).slice(0, 1); }
        return provided.filter((provider) => provider.id === selection);
    }
    return createSegmentationProviders(selection, profile === 'balanced' ? 'accurate' : 'fast');
}

function sourceId(provider: SegmentationProvider): string { return `${MODULE_ID}:${provider.id}`; }

function recordProviderIssue(db: SqliteDatabase, assetId: string, provider: SegmentationProvider, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare("INSERT INTO processing_issues (id, asset_id, task, severity, message, details) VALUES (?, ?, ?, 'warning', ?, ?)")
        .run(uuidv4(), assetId, RESULT_TASK, `${provider.id}: ${message}`, JSON.stringify({ functionalModuleId: MODULE_ID, providerId: provider.id, modelId: provider.modelId, modelVersion: provider.modelVersion }));
}

async function metadataForMasks(provider: SegmentationProvider, masks: SegmentationMask[]): Promise<PhotoMaskMetadataItem[]> {
    return Promise.all(masks.map(async (mask, index) => {
        const referenceId = `${MODULE_ID}:${provider.id}:segment-${index + 1}`;
        const raster = await encodeMaskRaster(mask.alpha, mask.width, mask.height);
        return {
            id: referenceId,
            label: `Segment ${index + 1} (${provider.id})`,
            description: `${provider.id} ${provider.modelVersion} segmentation`,
            kind: 'raster' as const,
            box: mask.box,
            raster,
            source: { moduleId: MODULE_ID, referenceId },
        };
    }));
}

function replaceSuccessfulResult(input: { db: SqliteDatabase; assetId: string; provider: SegmentationProvider; metadata: PhotoMaskMetadataItem[]; profile: unknown; rawMaskCount: number; elapsedMs: number }): void {
    const { db, assetId, provider, metadata } = input;
    const rasterDimensions = metadata.map((mask) => ({ width: mask.raster?.width, height: mask.raster?.height }));
    const provenance = {
        functionalModuleId: MODULE_ID,
        providerRequested: provider.id,
        providerResolved: provider.id,
        providerId: provider.id,
        modelId: provider.modelId,
        modelVersion: provider.modelVersion,
        processingProfile: input.profile ?? 'quick',
        promptStrategy: provider.capabilities.automaticCandidates ? 'provider-automatic' : 'deterministic-3x3-positive-grid',
        totalElapsedMs: input.elapsedMs,
        rawMaskCount: input.rawMaskCount,
        retainedMaskCount: metadata.length,
        persistedRasterDimensions: rasterDimensions,
        providerProfile: provider.inferenceProfile,
        executedAt: new Date().toISOString(),
    };
    const persist = db.transaction(() => {
        // Replacement is deliberately delayed until inference and raster encoding have succeeded.
        db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ? AND provider = ?').run(assetId, RESULT_TASK, provider.id);
        db.prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data) VALUES (?, ?, ?, ?, ?, ?)")
            .run(uuidv4(), assetId, RESULT_TASK, provider.id, provider.modelVersion, JSON.stringify({ masks: metadata.map((mask) => ({ id: mask.id, box: mask.box })), provenance }));
        saveAssetMaskMetadata(db, { assetId, sourceId: sourceId(provider), masks: metadata });
        db.prepare("DELETE FROM processing_issues WHERE asset_id = ? AND task = ? AND message LIKE ?").run(assetId, RESULT_TASK, `${provider.id}:%`);
    });
    persist();
}

async function runProvider(input: { provider: SegmentationProvider; originalPath: string; assetId: string; profile: unknown; maximum: number; db: SqliteDatabase }): Promise<void> {
    const { provider } = input;
    if (!provider.isAvailable()) {
        recordProviderIssue(input.db, input.assetId, provider, 'The required model is not installed. Previous successful masks were kept.');
        return;
    }
    const startedAt = Date.now();
    let prepared: Awaited<ReturnType<SegmentationProvider['prepare']>> | undefined;
    try {
        prepared = await provider.prepare(await prepareSegmentationImage(input.originalPath));
        const rawMasks = await provider.automaticCandidates(prepared);
        const retained = retainSegmentationMasks(rawMasks, input.maximum);
        const metadata = await metadataForMasks(provider, retained);
        replaceSuccessfulResult({ db: input.db, assetId: input.assetId, provider, metadata, profile: input.profile, rawMaskCount: rawMasks.length, elapsedMs: Date.now() - startedAt });
    } catch (error) {
        // A failure is not an empty successful result. The old scoped result and masks stay intact.
        recordProviderIssue(input.db, input.assetId, provider, error);
    } finally {
        await prepared?.dispose();
        await provider.dispose();
    }
}

export function createSegmentObjectsModule(options: SegmentObjectsModuleOptions): ModuleDefinition {
    return {
        id: MODULE_ID,
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: RESULT_TASK, subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(context.subject.subjectId) as { original_path: string } | undefined;
            if (asset?.original_path && existsSync(asset.original_path)) {
                const providers = selectedProviders(context.parameters.provider ?? context.parameters.objectProvider, context.parameters.profile, options.providers);
                for (const provider of providers) {
                    await runProvider({ provider, originalPath: asset.original_path, assetId: context.subject.subjectId, profile: context.parameters.profile, maximum: boundedMaximum(context.parameters.maxResults), db });
                }
            }
            options.eventBus?.emit({ type: 'AssetUpdated', assetId: context.subject.subjectId });
            return { outputs: [{ kind: 'artifact', artifactType: RESULT_TASK, subjectType: 'asset' }] };
        },
    };
}
