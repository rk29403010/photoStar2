import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { NormalizedBox } from '../../boundary/contracts/photoEditor';
import { ensureSemanticEntity } from '../relationships/semanticRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type VisualRegionGeometryGenerationInput = {
    visualRegionId: string;
    sourceAnalysisGenerationId: string;
    box: NormalizedBox;
    sourceWidth: number;
    sourceHeight: number;
    sourceOrientation: number;
    sourceModuleId: string;
    provider: string;
    modelVersion: string;
    status?: string;
};

export type CreateStableFaceDetectionInput = Omit<VisualRegionGeometryGenerationInput, 'visualRegionId'> & {
    assetId: string;
};

export type StableFaceDetectionIdentity = {
    visualRegionId: string;
    faceId: string;
    geometryGenerationId: string;
};

function assertNonEmpty(value: string, label: string): void {
    if (value.trim().length === 0) {
        throw new Error(`${label} must not be empty.`);
    }
}

function assertSourceDimensions(width: number, height: number, orientation: number): void {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
        throw new Error('Visual region source dimensions must be positive integers.');
    }
    if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8) {
        throw new Error('Visual region source orientation must be an EXIF orientation from 1 to 8.');
    }
}

function assertNormalizedBox(box: NormalizedBox): void {
    const values = [box.x, box.y, box.width, box.height];
    if (!values.every(Number.isFinite)) {
        throw new Error('Visual region geometry values must be finite.');
    }
    if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
        throw new Error('Visual region geometry must have non-negative origin and positive dimensions.');
    }
    const epsilon = 1e-9;
    if (box.x > 1 || box.y > 1 || box.width > 1 || box.height > 1
        || box.x + box.width > 1 + epsilon || box.y + box.height > 1 + epsilon) {
        throw new Error('Visual region geometry must be normalized to the canonical image bounds.');
    }
}

function ensureAssetIdentity(db: DbHandle, assetId: string): string {
    assertNonEmpty(assetId, 'Stable face assetId');
    const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?')
        .get(assetId) as { original_path: string } | undefined;
    if (!asset) {
        throw new Error(`Unknown asset '${assetId}'.`);
    }

    const existing = db.prepare('SELECT guid FROM asset_identities WHERE original_path = ?')
        .get(asset.original_path) as { guid: string } | undefined;
    if (existing) {
        return existing.guid;
    }

    const proposedGuid = uuidv4();
    db.prepare(`
        INSERT INTO asset_identities (guid, original_path, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(original_path) DO NOTHING
    `).run(proposedGuid, asset.original_path);

    const persisted = db.prepare('SELECT guid FROM asset_identities WHERE original_path = ?')
        .get(asset.original_path) as { guid: string } | undefined;
    if (!persisted) {
        throw new Error(`Unable to establish durable identity for asset '${assetId}'.`);
    }
    return persisted.guid;
}

export function appendVisualRegionGeometryGeneration(
    db: DbHandle,
    input: VisualRegionGeometryGenerationInput,
): string {
    assertNonEmpty(input.visualRegionId, 'Visual region id');
    assertNonEmpty(input.sourceAnalysisGenerationId, 'Visual region source analysis generation');
    assertNonEmpty(input.sourceModuleId, 'Visual region source module');
    assertNonEmpty(input.provider, 'Visual region provider');
    assertNonEmpty(input.modelVersion, 'Visual region model version');
    const status = input.status ?? 'active';
    assertNonEmpty(status, 'Visual region geometry status');
    assertSourceDimensions(input.sourceWidth, input.sourceHeight, input.sourceOrientation);
    assertNormalizedBox(input.box);

    const region = db.prepare('SELECT id FROM visual_regions WHERE id = ?')
        .get(input.visualRegionId) as { id: string } | undefined;
    if (!region) {
        throw new Error(`Unknown visual region '${input.visualRegionId}'.`);
    }

    const generationId = uuidv4();
    db.prepare(`
        INSERT INTO visual_region_geometry_generations (
            id,
            visual_region_id,
            source_analysis_generation_id,
            x,
            y,
            width,
            height,
            source_width,
            source_height,
            source_orientation,
            source_module_id,
            provider,
            model_version,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        generationId,
        input.visualRegionId,
        input.sourceAnalysisGenerationId,
        input.box.x,
        input.box.y,
        input.box.width,
        input.box.height,
        input.sourceWidth,
        input.sourceHeight,
        input.sourceOrientation,
        input.sourceModuleId,
        input.provider,
        input.modelVersion,
        status,
    );
    return generationId;
}

export function createStableFaceDetection(
    db: DbHandle,
    input: CreateStableFaceDetectionInput,
): StableFaceDetectionIdentity {
    return db.transaction(() => {
        const assetIdentityGuid = ensureAssetIdentity(db, input.assetId);
        const visualRegionId = ensureSemanticEntity(db, {
            kind: 'region',
            nativeId: uuidv4(),
        });
        const faceId = ensureSemanticEntity(db, {
            kind: 'face',
            nativeId: uuidv4(),
        });

        db.prepare(`
            INSERT INTO visual_regions (id, asset_identity_guid)
            VALUES (?, ?)
        `).run(visualRegionId, assetIdentityGuid);
        db.prepare(`
            INSERT INTO faces (id, visual_region_id)
            VALUES (?, ?)
        `).run(faceId, visualRegionId);

        const geometryGenerationId = appendVisualRegionGeometryGeneration(db, {
            visualRegionId,
            sourceAnalysisGenerationId: input.sourceAnalysisGenerationId,
            box: input.box,
            sourceWidth: input.sourceWidth,
            sourceHeight: input.sourceHeight,
            sourceOrientation: input.sourceOrientation,
            sourceModuleId: input.sourceModuleId,
            provider: input.provider,
            modelVersion: input.modelVersion,
            status: input.status,
        });

        return {
            visualRegionId,
            faceId,
            geometryGenerationId,
        };
    })();
}
