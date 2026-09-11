import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { NormalizedBox } from '../../boundary/contracts/photoEditor';
import { ensureSemanticEntity } from '../relationships/semanticRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type VisualRegionGeometryStatus = 'active' | 'unmatched' | 'tombstoned';

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
    status?: VisualRegionGeometryStatus;
};

export type CreateStableFaceDetectionInput = Omit<VisualRegionGeometryGenerationInput, 'visualRegionId'> & {
    assetId: string;
};

export type StableFaceDetectionIdentity = {
    visualRegionId: string;
    faceId: string;
    geometryGenerationId: string;
};

export type ReconcileableStableFaceRegion = {
    visualRegionId: string;
    faceId: string;
    box: NormalizedBox;
    provider: string;
    modelVersion: string;
    status: Exclude<VisualRegionGeometryStatus, 'tombstoned'>;
};

export type MarkStableFaceRegionStatusInput = Omit<
    VisualRegionGeometryGenerationInput,
    'box' | 'status'
> & {
    status: Exclude<VisualRegionGeometryStatus, 'active'>;
};

type LatestGeometryRow = {
    x: number;
    y: number;
    width: number;
    height: number;
    provider: string;
    model_version: string;
    status: VisualRegionGeometryStatus;
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

function hasPositiveNormalizedExtent(box: NormalizedBox): boolean {
    return box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0;
}

function fitsNormalizedBounds(box: NormalizedBox): boolean {
    const epsilon = 1e-9;
    const values = [box.x, box.y, box.width, box.height];
    return values.every((value) => value <= 1)
        && box.x + box.width <= 1 + epsilon
        && box.y + box.height <= 1 + epsilon;
}

function assertNormalizedBox(box: NormalizedBox): void {
    const values = [box.x, box.y, box.width, box.height];
    if (!values.every(Number.isFinite)) {
        throw new Error('Visual region geometry values must be finite.');
    }
    if (!hasPositiveNormalizedExtent(box)) {
        throw new Error('Visual region geometry must have non-negative origin and positive dimensions.');
    }
    if (!fitsNormalizedBounds(box)) {
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

function latestGeometryForRegion(db: DbHandle, visualRegionId: string): LatestGeometryRow {
    const row = db.prepare(`
        SELECT x, y, width, height, provider, model_version, status
        FROM visual_region_geometry_generations
        WHERE visual_region_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
    `).get(visualRegionId) as LatestGeometryRow | undefined;
    if (!row) {
        throw new Error(`Visual region '${visualRegionId}' has no geometry generation.`);
    }
    return row;
}

function faceIdForRegion(db: DbHandle, visualRegionId: string): string {
    const face = db.prepare('SELECT id FROM faces WHERE visual_region_id = ?')
        .get(visualRegionId) as { id: string } | undefined;
    if (!face) {
        throw new Error(`Visual region '${visualRegionId}' has no Face entity.`);
    }
    return face.id;
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

export function loadReconcileableStableFaceRegions(
    db: DbHandle,
    assetId: string,
): ReconcileableStableFaceRegion[] {
    const assetIdentityGuid = ensureAssetIdentity(db, assetId);
    const rows = db.prepare(`
        SELECT
            region.id AS visual_region_id,
            face.id AS face_id,
            geometry.x,
            geometry.y,
            geometry.width,
            geometry.height,
            geometry.provider,
            geometry.model_version,
            geometry.status
        FROM visual_regions region
        JOIN faces face ON face.visual_region_id = region.id
        JOIN visual_region_geometry_generations geometry
          ON geometry.rowid = (
              SELECT candidate.rowid
              FROM visual_region_geometry_generations candidate
              WHERE candidate.visual_region_id = region.id
              ORDER BY candidate.created_at DESC, candidate.rowid DESC
              LIMIT 1
          )
        WHERE region.asset_identity_guid = ?
          AND geometry.status IN ('active', 'unmatched')
        ORDER BY region.id ASC
    `).all(assetIdentityGuid) as Array<{
        visual_region_id: string;
        face_id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        provider: string;
        model_version: string;
        status: ReconcileableStableFaceRegion['status'];
    }>;
    return rows.map((row) => ({
        visualRegionId: row.visual_region_id,
        faceId: row.face_id,
        box: { x: row.x, y: row.y, width: row.width, height: row.height },
        provider: row.provider,
        modelVersion: row.model_version,
        status: row.status,
    }));
}

export function reuseStableFaceDetection(
    db: DbHandle,
    input: VisualRegionGeometryGenerationInput,
): StableFaceDetectionIdentity {
    const faceId = faceIdForRegion(db, input.visualRegionId);
    const geometryGenerationId = appendVisualRegionGeometryGeneration(db, {
        ...input,
        status: 'active',
    });
    return { visualRegionId: input.visualRegionId, faceId, geometryGenerationId };
}

export function markStableFaceRegionStatus(
    db: DbHandle,
    input: MarkStableFaceRegionStatusInput,
): string {
    const latest = latestGeometryForRegion(db, input.visualRegionId);
    return appendVisualRegionGeometryGeneration(db, {
        ...input,
        box: {
            x: latest.x,
            y: latest.y,
            width: latest.width,
            height: latest.height,
        },
        status: input.status,
    });
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
