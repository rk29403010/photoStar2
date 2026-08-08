import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import { detectPeriodicTexture, type PeriodicTextureDetection } from '../../../../imageAnalysis/periodicTexture/detection.ts';
import { TagRepository } from '../../../../tags/tagRepository.ts';
import type { ModuleDefinition } from '../../../contracts';

const TASK = 'print_texture_detection';
const TAG_LABEL = 'print texture detected';
const MODULE_ID = 'runtime.detect_print_texture';

type DetectPrintTextureModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: { emit: (event: AssetUpdated) => void };
};

type AssetPathRow = { original_path: string };

async function detectFromFile(path: string): Promise<PeriodicTextureDetection> {
    const { data, info } = await sharp(path)
        .rotate()
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return detectPeriodicTexture(
        { data, width: info.width, height: info.height },
        { minPeriodPx: 6, maxPeriodPx: 80 },
    );
}

function saveDetection(db: ReturnType<DatabaseManager['getDb']>, assetId: string, detection: PeriodicTextureDetection): string {
    db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(assetId, TASK);
    const resultId = uuidv4();
    const data = {
        likely: detection.likely,
        confidence: detection.confidence,
        fundamentalPeriodPx: detection.fundamentalPeriodPx,
        strongestPeakZ: detection.strongestPeakZ,
        meanTileSupport: detection.meanTileSupport,
        tileSize: detection.tileSize,
        tilesUsed: detection.tilesUsed,
        peaks: detection.peaks,
        provenance: {
            functionalModuleId: MODULE_ID,
            providerId: 'deterministic_fourier_periodicity',
            modelVersion: '1.0',
            executedAt: new Date().toISOString(),
        },
    };
    db.prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data) VALUES (?, ?, ?, ?, ?, ?)")
        .run(resultId, assetId, TASK, 'deterministic_fourier_periodicity', '1.0', JSON.stringify(data));
    return resultId;
}

function ensureTag(repository: TagRepository): string {
    const existing = repository.findTagDefinitionByLabel(TAG_LABEL);
    if (existing) { return existing.id; }
    try {
        return repository.createTagDefinition({
            canonicalLabel: TAG_LABEL,
            description: 'Deterministically detected periodic print-screen or photographic-paper texture.',
            category: 'technical',
        });
    } catch (error) {
        const concurrent = repository.findTagDefinitionByLabel(TAG_LABEL);
        if (concurrent) { return concurrent.id; }
        throw error;
    }
}

function updateTag(repository: TagRepository, assetId: string, resultId: string, detection: PeriodicTextureDetection): void {
    const tagDefinitionId = ensureTag(repository);
    if (detection.likely) {
        repository.assignTagToAsset({
            assetId,
            tagDefinitionId,
            sourceKind: 'system',
            sourceRecordId: resultId,
            confidence: Math.max(0, Math.min(1, detection.confidence / 100)),
        });
        return;
    }
    repository.removeTagAssignment({ assetId, tagDefinitionId, sourceKind: 'system' });
}

export function createDetectPrintTextureModule(options: DetectPrintTextureModuleOptions): ModuleDefinition {
    return {
        id: MODULE_ID,
        version: 1,
        capability: 'analyze',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'print_texture_detection', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const assetId = context.subject.subjectId;
            const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as AssetPathRow | undefined;
            if (!asset?.original_path || !existsSync(asset.original_path)) {
                return { outputs: [{ kind: 'artifact', artifactType: 'print_texture_detection', subjectType: 'asset' }] };
            }
            try {
                const detection = await detectFromFile(asset.original_path);
                const resultId = saveDetection(db, assetId, detection);
                updateTag(new TagRepository(options.dbManager), assetId, resultId, detection);
                db.prepare('DELETE FROM processing_issues WHERE asset_id = ? AND task = ?').run(assetId, TASK);
            } catch (error) {
                db.prepare("INSERT INTO processing_issues (id, asset_id, task, severity, message, details) VALUES (?, ?, ?, 'warning', ?, ?)")
                    .run(uuidv4(), assetId, TASK, error instanceof Error ? error.message : String(error), JSON.stringify({ functionalModuleId: MODULE_ID }));
            }
            options.eventBus?.emit({ type: 'AssetUpdated', assetId });
            return { outputs: [{ kind: 'artifact', artifactType: 'print_texture_detection', subjectType: 'asset' }] };
        },
    };
}
