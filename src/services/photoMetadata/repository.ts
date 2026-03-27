import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import type {
    PhotoMetadataAuthenticity,
    PhotoMetadataBlock,
    PhotoMetadataEstimatedDate,
    PhotoMetadataQuality,
    PhotoMetadataRegionOfInterest,
    PhotoMetadataSubject,
} from './types';
import {
    isPhotoMetadataBlock,
    isPhotoMetadataFieldPath,
    normalizeIsoDateOrNull,
} from './validation';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type JsonValue = unknown;
type IsoDateFieldPath = 'estimated_date.most_likely_date' | 'estimated_date.min_date' | 'estimated_date.max_date';

export interface PhotoMetadataFieldSource {
    sourceKind: string;
    sourceId: string;
}

export interface PhotoMetadataProjectionInput {
    assetId: string;
    type: string | null;
    caption: string | null;
    description: string | null;
    location: string | null;
    estimatedDate: PhotoMetadataEstimatedDate;
    keywords: string[];
    emotionalImpact: string | null;
    quality: PhotoMetadataQuality;
    recommendedEnhancements: string[];
    authenticity: PhotoMetadataAuthenticity;
    subjects?: PhotoMetadataSubject[];
    regionsOfInterest?: PhotoMetadataRegionOfInterest[];
    provenance: {
        type?: PhotoMetadataFieldSource;
        caption?: PhotoMetadataFieldSource;
        description?: PhotoMetadataFieldSource;
        location?: PhotoMetadataFieldSource;
        estimatedDate?: PhotoMetadataFieldSource;
        keywords?: PhotoMetadataFieldSource;
        emotionalImpact?: PhotoMetadataFieldSource;
        quality?: PhotoMetadataFieldSource;
        recommendedEnhancements?: PhotoMetadataFieldSource;
        authenticity?: PhotoMetadataFieldSource;
        subjects?: PhotoMetadataFieldSource;
        regionsOfInterest?: PhotoMetadataFieldSource;
    };
}

export interface InsertMetadataBlockParams {
    assetId: string;
    sourceKind: string;
    provider: string;
    modelVersion: string | null;
    schemaVersion: number;
    block: PhotoMetadataBlock;
    id?: string;
}

export interface InsertManualAssertionParams {
    assetId: string;
    fieldPath: string;
    value: JsonValue;
    userId: string;
    note?: string | null;
    id?: string;
}

export interface PhotoMetadataBlockRow {
    id: string;
    asset_id: string;
    source_kind: string;
    provider: string;
    model_version: string | null;
    schema_version: number;
    data: PhotoMetadataBlock;
    created_at: string;
}

export interface PhotoMetadataAssertionRow {
    id: string;
    asset_id: string;
    field_path: string;
    value: JsonValue;
    user_id: string;
    note: string | null;
    created_at: string;
}

export interface PhotoMetadataProjectionRow {
    asset_id: string;
    type: string | null;
    type_source_kind: string | null;
    type_source_id: string | null;
    caption: string | null;
    caption_source_kind: string | null;
    caption_source_id: string | null;
    description: string | null;
    description_source_kind: string | null;
    description_source_id: string | null;
    location: string | null;
    location_source_kind: string | null;
    location_source_id: string | null;
    estimated_date_most_likely: string | null;
    estimated_date_min: string | null;
    estimated_date_max: string | null;
    estimated_date_display_label: string | null;
    estimated_date_rationale: string | null;
    estimated_date_source_kind: string | null;
    estimated_date_source_id: string | null;
    keywords_json: string | null;
    keywords_source_kind: string | null;
    keywords_source_id: string | null;
    emotional_impact: string | null;
    emotional_impact_source_kind: string | null;
    emotional_impact_source_id: string | null;
    quality_technical: number | null;
    quality_lighting: number | null;
    quality_composition: number | null;
    quality_emotional: number | null;
    quality_discard: number | null;
    quality_source_kind: string | null;
    quality_source_id: string | null;
    recommended_enhancements_json: string | null;
    recommended_enhancements_source_kind: string | null;
    recommended_enhancements_source_id: string | null;
    authenticity_score: number | null;
    authenticity_reasons_json: string | null;
    authenticity_source_kind: string | null;
    authenticity_source_id: string | null;
    subjects_json: string | null;
    subjects_source_kind: string | null;
    subjects_source_id: string | null;
    regions_of_interest_json: string | null;
    regions_of_interest_source_kind: string | null;
    regions_of_interest_source_id: string | null;
    created_at: string;
    updated_at: string;
}

const ISO_DATE_FIELD_PATHS = new Set<IsoDateFieldPath>([
    'estimated_date.most_likely_date',
    'estimated_date.min_date',
    'estimated_date.max_date',
] );

function createId(value?: string): string {
    return value ?? randomUUID();
}

function stringifyJson(value: unknown): string {
    return JSON.stringify(value);
}

function parseJson<T>(value: string | null): T {
    return JSON.parse(value ?? 'null') as T;
}

function parsePhotoMetadataBlock(value: string): PhotoMetadataBlock {
    const parsed = parseJson<unknown>(value);
    if (!isPhotoMetadataBlock(parsed)) {
        throw new Error('Stored photo metadata block is invalid');
    }
    return parsed;
}

function normalizeAssertionValue(fieldPath: string, value: JsonValue): JsonValue {
    if (!ISO_DATE_FIELD_PATHS.has(fieldPath as IsoDateFieldPath)) {
        return value;
    }

    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error(`Photo metadata field '${fieldPath}' requires an ISO date string or null`);
    }

    const normalized = normalizeIsoDateOrNull(value);
    if (normalized === null) {
        throw new Error(`Photo metadata field '${fieldPath}' requires an ISO date string or null`);
    }

    return normalized;
}

function toSourceParams(source: PhotoMetadataFieldSource | undefined): { kind: string | null; id: string | null } {
    if (!source) {
        return { kind: null, id: null };
    }

    return { kind: source.sourceKind, id: source.sourceId };
}

function toProjectionJson(value: unknown): string | null {
    return value === undefined ? null : stringifyJson(value);
}

function buildProjectionParams(input: PhotoMetadataProjectionInput) {
    const typeSource = toSourceParams(input.provenance.type);
    const captionSource = toSourceParams(input.provenance.caption);
    const descriptionSource = toSourceParams(input.provenance.description);
    const locationSource = toSourceParams(input.provenance.location);
    const estimatedDateSource = toSourceParams(input.provenance.estimatedDate);
    const keywordsSource = toSourceParams(input.provenance.keywords);
    const emotionalImpactSource = toSourceParams(input.provenance.emotionalImpact);
    const qualitySource = toSourceParams(input.provenance.quality);
    const recommendedEnhancementsSource = toSourceParams(input.provenance.recommendedEnhancements);
    const authenticitySource = toSourceParams(input.provenance.authenticity);
    const subjectsSource = toSourceParams(input.provenance.subjects);
    const regionsOfInterestSource = toSourceParams(input.provenance.regionsOfInterest);

    return {
        asset_id: input.assetId,
        type: input.type,
        type_source_kind: typeSource.kind,
        type_source_id: typeSource.id,
        caption: input.caption,
        caption_source_kind: captionSource.kind,
        caption_source_id: captionSource.id,
        description: input.description,
        description_source_kind: descriptionSource.kind,
        description_source_id: descriptionSource.id,
        location: input.location,
        location_source_kind: locationSource.kind,
        location_source_id: locationSource.id,
        estimated_date_most_likely: normalizeIsoDateOrNull(input.estimatedDate.most_likely_date),
        estimated_date_min: normalizeIsoDateOrNull(input.estimatedDate.min_date),
        estimated_date_max: normalizeIsoDateOrNull(input.estimatedDate.max_date),
        estimated_date_display_label: input.estimatedDate.display_label,
        estimated_date_rationale: input.estimatedDate.rationale,
        estimated_date_source_kind: estimatedDateSource.kind,
        estimated_date_source_id: estimatedDateSource.id,
        keywords_json: toProjectionJson(input.keywords),
        keywords_source_kind: keywordsSource.kind,
        keywords_source_id: keywordsSource.id,
        emotional_impact: input.emotionalImpact,
        emotional_impact_source_kind: emotionalImpactSource.kind,
        emotional_impact_source_id: emotionalImpactSource.id,
        quality_technical: input.quality.technical,
        quality_lighting: input.quality.lighting,
        quality_composition: input.quality.composition,
        quality_emotional: input.quality.emotional,
        quality_discard: input.quality.discard ? 1 : 0,
        quality_source_kind: qualitySource.kind,
        quality_source_id: qualitySource.id,
        recommended_enhancements_json: toProjectionJson(input.recommendedEnhancements),
        recommended_enhancements_source_kind: recommendedEnhancementsSource.kind,
        recommended_enhancements_source_id: recommendedEnhancementsSource.id,
        authenticity_score: input.authenticity.score,
        authenticity_reasons_json: toProjectionJson(input.authenticity.reasons),
        authenticity_source_kind: authenticitySource.kind,
        authenticity_source_id: authenticitySource.id,
        subjects_json: toProjectionJson(input.subjects ?? []),
        subjects_source_kind: subjectsSource.kind,
        subjects_source_id: subjectsSource.id,
        regions_of_interest_json: toProjectionJson(input.regionsOfInterest ?? []),
        regions_of_interest_source_kind: regionsOfInterestSource.kind,
        regions_of_interest_source_id: regionsOfInterestSource.id,
    };
}

export class PhotoMetadataRepository {
    constructor(private readonly dbManager: DatabaseManager) {}

    private get db(): DbHandle {
        return this.dbManager.getDb();
    }

    insertMetadataBlock(params: InsertMetadataBlockParams): string {
        if (!isPhotoMetadataBlock(params.block)) {
            throw new Error('Invalid photo metadata block');
        }

        if (!Number.isInteger(params.schemaVersion) || params.schemaVersion <= 0) {
            throw new Error('schemaVersion must be a positive integer');
        }

        const id = createId(params.id);
        this.db.prepare(`
            INSERT INTO photo_metadata_blocks (
                id, asset_id, source_kind, provider, model_version, schema_version, data
            ) VALUES (
                @id, @asset_id, @source_kind, @provider, @model_version, @schema_version, @data
            )
        `).run({
            id,
            asset_id: params.assetId,
            source_kind: params.sourceKind,
            provider: params.provider,
            model_version: params.modelVersion,
            schema_version: params.schemaVersion,
            data: stringifyJson(params.block),
        });

        return id;
    }

    insertManualAssertion(params: InsertManualAssertionParams): string {
        if (!isPhotoMetadataFieldPath(params.fieldPath)) {
            throw new Error(`Invalid photo metadata field path: ${params.fieldPath}`);
        }

        const id = createId(params.id);
        const normalizedValue = normalizeAssertionValue(params.fieldPath, params.value);
        this.db.prepare(`
            INSERT INTO photo_metadata_assertions (
                id, asset_id, field_path, value_json, user_id, note
            ) VALUES (
                @id, @asset_id, @field_path, @value_json, @user_id, @note
            )
        `).run({
            id,
            asset_id: params.assetId,
            field_path: params.fieldPath,
            value_json: stringifyJson(normalizedValue),
            user_id: params.userId,
            note: params.note ?? null,
        });

        return id;
    }

    listBlocksForAsset(assetId: string): PhotoMetadataBlockRow[] {
        const rows = this.db.prepare(`
            SELECT id, asset_id, source_kind, provider, model_version, schema_version, data, created_at
            FROM photo_metadata_blocks
            WHERE asset_id = ?
            ORDER BY datetime(created_at) ASC, id ASC
        `).all(assetId) as Array<Omit<PhotoMetadataBlockRow, 'data'> & { data: string }>;

        return rows.map((row) => ({
            ...row,
            data: parsePhotoMetadataBlock(row.data),
        }));
    }

    listAssertionsForAsset(assetId: string): PhotoMetadataAssertionRow[] {
        const rows = this.db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE asset_id = ?
            ORDER BY datetime(created_at) ASC, id ASC
        `).all(assetId) as Array<Omit<PhotoMetadataAssertionRow, 'value'> & { value_json: string }>;

        return rows.map((row) => ({
            id: row.id,
            asset_id: row.asset_id,
            field_path: row.field_path,
            value: parseJson<JsonValue>(row.value_json),
            user_id: row.user_id,
            note: row.note,
            created_at: row.created_at,
        }));
    }

    saveProjection(input: PhotoMetadataProjectionInput): void {
        const params = buildProjectionParams(input);
        this.db.prepare(`
            INSERT INTO photo_metadata_projection (
                asset_id,
                type, type_source_kind, type_source_id,
                caption, caption_source_kind, caption_source_id,
                description, description_source_kind, description_source_id,
                location, location_source_kind, location_source_id,
                estimated_date_most_likely, estimated_date_min, estimated_date_max,
                estimated_date_display_label, estimated_date_rationale,
                estimated_date_source_kind, estimated_date_source_id,
                keywords_json, keywords_source_kind, keywords_source_id,
                emotional_impact, emotional_impact_source_kind, emotional_impact_source_id,
                quality_technical, quality_lighting, quality_composition, quality_emotional, quality_discard,
                quality_source_kind, quality_source_id,
                recommended_enhancements_json, recommended_enhancements_source_kind, recommended_enhancements_source_id,
                authenticity_score, authenticity_reasons_json, authenticity_source_kind, authenticity_source_id,
                subjects_json, subjects_source_kind, subjects_source_id,
                regions_of_interest_json, regions_of_interest_source_kind, regions_of_interest_source_id
            ) VALUES (
                @asset_id,
                @type, @type_source_kind, @type_source_id,
                @caption, @caption_source_kind, @caption_source_id,
                @description, @description_source_kind, @description_source_id,
                @location, @location_source_kind, @location_source_id,
                @estimated_date_most_likely, @estimated_date_min, @estimated_date_max,
                @estimated_date_display_label, @estimated_date_rationale,
                @estimated_date_source_kind, @estimated_date_source_id,
                @keywords_json, @keywords_source_kind, @keywords_source_id,
                @emotional_impact, @emotional_impact_source_kind, @emotional_impact_source_id,
                @quality_technical, @quality_lighting, @quality_composition, @quality_emotional, @quality_discard,
                @quality_source_kind, @quality_source_id,
                @recommended_enhancements_json, @recommended_enhancements_source_kind, @recommended_enhancements_source_id,
                @authenticity_score, @authenticity_reasons_json, @authenticity_source_kind, @authenticity_source_id,
                @subjects_json, @subjects_source_kind, @subjects_source_id,
                @regions_of_interest_json, @regions_of_interest_source_kind, @regions_of_interest_source_id
            )
            ON CONFLICT(asset_id) DO UPDATE SET
                type = excluded.type,
                type_source_kind = excluded.type_source_kind,
                type_source_id = excluded.type_source_id,
                caption = excluded.caption,
                caption_source_kind = excluded.caption_source_kind,
                caption_source_id = excluded.caption_source_id,
                description = excluded.description,
                description_source_kind = excluded.description_source_kind,
                description_source_id = excluded.description_source_id,
                location = excluded.location,
                location_source_kind = excluded.location_source_kind,
                location_source_id = excluded.location_source_id,
                estimated_date_most_likely = excluded.estimated_date_most_likely,
                estimated_date_min = excluded.estimated_date_min,
                estimated_date_max = excluded.estimated_date_max,
                estimated_date_display_label = excluded.estimated_date_display_label,
                estimated_date_rationale = excluded.estimated_date_rationale,
                estimated_date_source_kind = excluded.estimated_date_source_kind,
                estimated_date_source_id = excluded.estimated_date_source_id,
                keywords_json = excluded.keywords_json,
                keywords_source_kind = excluded.keywords_source_kind,
                keywords_source_id = excluded.keywords_source_id,
                emotional_impact = excluded.emotional_impact,
                emotional_impact_source_kind = excluded.emotional_impact_source_kind,
                emotional_impact_source_id = excluded.emotional_impact_source_id,
                quality_technical = excluded.quality_technical,
                quality_lighting = excluded.quality_lighting,
                quality_composition = excluded.quality_composition,
                quality_emotional = excluded.quality_emotional,
                quality_discard = excluded.quality_discard,
                quality_source_kind = excluded.quality_source_kind,
                quality_source_id = excluded.quality_source_id,
                recommended_enhancements_json = excluded.recommended_enhancements_json,
                recommended_enhancements_source_kind = excluded.recommended_enhancements_source_kind,
                recommended_enhancements_source_id = excluded.recommended_enhancements_source_id,
                authenticity_score = excluded.authenticity_score,
                authenticity_reasons_json = excluded.authenticity_reasons_json,
                authenticity_source_kind = excluded.authenticity_source_kind,
                authenticity_source_id = excluded.authenticity_source_id,
                subjects_json = excluded.subjects_json,
                subjects_source_kind = excluded.subjects_source_kind,
                subjects_source_id = excluded.subjects_source_id,
                regions_of_interest_json = excluded.regions_of_interest_json,
                regions_of_interest_source_kind = excluded.regions_of_interest_source_kind,
                regions_of_interest_source_id = excluded.regions_of_interest_source_id,
                updated_at = CURRENT_TIMESTAMP
        `).run(params);
    }

    loadProjection(assetId: string): PhotoMetadataProjectionRow | null {
        return this.db.prepare(`
            SELECT
                asset_id,
                type, type_source_kind, type_source_id,
                caption, caption_source_kind, caption_source_id,
                description, description_source_kind, description_source_id,
                location, location_source_kind, location_source_id,
                estimated_date_most_likely, estimated_date_min, estimated_date_max,
                estimated_date_display_label, estimated_date_rationale,
                estimated_date_source_kind, estimated_date_source_id,
                keywords_json, keywords_source_kind, keywords_source_id,
                emotional_impact, emotional_impact_source_kind, emotional_impact_source_id,
                quality_technical, quality_lighting, quality_composition, quality_emotional, quality_discard,
                quality_source_kind, quality_source_id,
                recommended_enhancements_json, recommended_enhancements_source_kind, recommended_enhancements_source_id,
                authenticity_score, authenticity_reasons_json, authenticity_source_kind, authenticity_source_id,
                subjects_json, subjects_source_kind, subjects_source_id,
                regions_of_interest_json, regions_of_interest_source_kind, regions_of_interest_source_id,
                created_at, updated_at
            FROM photo_metadata_projection
            WHERE asset_id = ?
        `).get(assetId) as PhotoMetadataProjectionRow | undefined ?? null;
    }
}

export function createPhotoMetadataRepository(options: { dbManager: DatabaseManager }): PhotoMetadataRepository {
    return new PhotoMetadataRepository(options.dbManager);
}
