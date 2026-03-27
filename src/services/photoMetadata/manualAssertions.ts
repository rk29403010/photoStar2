import type { DatabaseManager } from '../../data/db';
import type {
    PhotoMetadataAuthenticityProvenance,
    PhotoMetadataBundle,
    PhotoMetadataEstimatedDateProvenance,
    PhotoMetadataProjection,
    PhotoMetadataQualityProvenance,
    PhotoMetadataSourceSummary,
} from '../../boundary/contracts/core';
import type { PhotoMetadataAssertionRow } from './repository';
import { createPhotoMetadataRepository } from './repository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type JsonValue = unknown;
type BundleProvenance = NonNullable<PhotoMetadataBundle['provenance']>;
type ManualSourceMap = Record<string, PhotoMetadataSourceSummary | undefined>;

export interface RecordManualAssertionParams {
    assetId: string;
    fieldPath: string;
    value: JsonValue;
    userId: string;
    note?: string | null;
}

export interface ListManualAssertionsParams {
    assetId: string;
    fieldPath?: string;
}

export interface ManualAssertionsService {
    recordManualAssertion(params: RecordManualAssertionParams): PhotoMetadataAssertionRow;
    listManualAssertions(assetId: string, fieldPath?: string): PhotoMetadataAssertionRow[];
    getLatestManualAssertionForField(assetId: string, fieldPath: string): PhotoMetadataAssertionRow | null;
}

function parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
}

function toAssertionRow(row: {
    id: string;
    asset_id: string;
    field_path: string;
    value_json: string;
    user_id: string;
    note: string | null;
    created_at: string;
}): PhotoMetadataAssertionRow {
    return {
        id: row.id,
        asset_id: row.asset_id,
        field_path: row.field_path,
        value: parseJson<JsonValue>(row.value_json),
        user_id: row.user_id,
        note: row.note,
        created_at: row.created_at,
    };
}

function listAssertionRows(db: DbHandle, params: ListManualAssertionsParams): PhotoMetadataAssertionRow[] {
    const rows = params.fieldPath
        ? db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE asset_id = ? AND field_path = ?
            ORDER BY datetime(created_at) DESC, rowid DESC
        `).all(params.assetId, params.fieldPath)
        : db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE asset_id = ?
            ORDER BY datetime(created_at) DESC, rowid DESC
        `).all(params.assetId);

    return (rows as Array<{
        id: string;
        asset_id: string;
        field_path: string;
        value_json: string;
        user_id: string;
        note: string | null;
        created_at: string;
    }>).map(toAssertionRow);
}

export class PhotoMetadataManualAssertionsService implements ManualAssertionsService {
    constructor(private readonly dbManager: DatabaseManager) {}

    private get db(): DbHandle {
        return this.dbManager.getDb();
    }

    recordManualAssertion(params: RecordManualAssertionParams): PhotoMetadataAssertionRow {
        const repository = createPhotoMetadataRepository({ dbManager: this.dbManager });
        const assertionId = repository.insertManualAssertion({
            assetId: params.assetId,
            fieldPath: params.fieldPath,
            value: params.value,
            userId: params.userId,
            note: params.note ?? null,
        });

        const row = this.db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE id = ?
        `).get(assertionId) as {
            id: string;
            asset_id: string;
            field_path: string;
            value_json: string;
            user_id: string;
            note: string | null;
            created_at: string;
        } | undefined;

        if (!row) {
            throw new Error('Failed to load stored manual assertion');
        }

        return toAssertionRow(row);
    }

    listManualAssertions(assetId: string, fieldPath?: string): PhotoMetadataAssertionRow[] {
        return listAssertionRows(this.db, { assetId, fieldPath });
    }

    getLatestManualAssertionForField(assetId: string, fieldPath: string): PhotoMetadataAssertionRow | null {
        return this.listManualAssertions(assetId, fieldPath)[0] ?? null;
    }
}

export function createPhotoMetadataManualAssertionsService(options: { dbManager: DatabaseManager }): ManualAssertionsService {
    return new PhotoMetadataManualAssertionsService(options.dbManager);
}

function toNullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function cloneProjection(projection: PhotoMetadataProjection): PhotoMetadataProjection {
    return {
        ...projection,
        estimatedDate: { ...projection.estimatedDate },
        quality: { ...projection.quality },
        authenticity: { ...projection.authenticity },
    };
}

function cloneProvenance(bundle: PhotoMetadataBundle): BundleProvenance {
    if (!bundle.provenance) {
        return {};
    }

    return {
        ...bundle.provenance,
        estimatedDate: bundle.provenance.estimatedDate ? { ...bundle.provenance.estimatedDate } : undefined,
        quality: bundle.provenance.quality ? { ...bundle.provenance.quality } : undefined,
        authenticity: bundle.provenance.authenticity ? { ...bundle.provenance.authenticity } : undefined,
    };
}

function setManualSource(
    provenance: BundleProvenance,
    key: string,
    sourceId: string,
) {
    (provenance as ManualSourceMap)[key] = { sourceKind: 'manual', sourceId };
}

function ensureEstimatedDateProvenance(provenance: BundleProvenance): PhotoMetadataEstimatedDateProvenance {
    if (!provenance.estimatedDate) {
        provenance.estimatedDate = { sourceKind: null, sourceId: null };
    }

    return provenance.estimatedDate;
}

function ensureQualityProvenance(provenance: BundleProvenance): PhotoMetadataQualityProvenance {
    if (!provenance.quality) {
        provenance.quality = { sourceKind: null, sourceId: null };
    }

    return provenance.quality;
}

function ensureAuthenticityProvenance(provenance: BundleProvenance): PhotoMetadataAuthenticityProvenance {
    if (!provenance.authenticity) {
        provenance.authenticity = { sourceKind: null, sourceId: null };
    }

    return provenance.authenticity;
}

function isManualSource(source: PhotoMetadataSourceSummary | undefined): boolean {
    return source?.sourceKind === 'manual';
}

function promoteEstimatedDateIfFullyManual(provenance: BundleProvenance, assertion: PhotoMetadataAssertionRow) {
    const estimatedDate = provenance.estimatedDate;
    if (
        estimatedDate
        && isManualSource(estimatedDate.display_label)
        && isManualSource(estimatedDate.most_likely_date)
        && isManualSource(estimatedDate.min_date)
        && isManualSource(estimatedDate.max_date)
        && isManualSource(estimatedDate.rationale)
    ) {
        provenance.estimatedDate = { ...estimatedDate, sourceKind: 'manual', sourceId: assertion.id };
    }
}

function promoteQualityIfFullyManual(provenance: BundleProvenance, assertion: PhotoMetadataAssertionRow) {
    const quality = provenance.quality;
    if (
        quality
        && isManualSource(quality.technical)
        && isManualSource(quality.lighting)
        && isManualSource(quality.composition)
        && isManualSource(quality.emotional)
        && isManualSource(quality.discard)
    ) {
        provenance.quality = { ...quality, sourceKind: 'manual', sourceId: assertion.id };
    }
}

function promoteAuthenticityIfFullyManual(provenance: BundleProvenance, assertion: PhotoMetadataAssertionRow) {
    const authenticity = provenance.authenticity;
    if (authenticity && isManualSource(authenticity.score) && isManualSource(authenticity.reasons)) {
        provenance.authenticity = { ...authenticity, sourceKind: 'manual', sourceId: assertion.id };
    }
}

function applyEstimatedDateAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    const field = assertion.field_path;
    const estimatedDate = ensureEstimatedDateProvenance(provenance);
    if (field === 'estimated_date.display_label') {
        projection.estimatedDate.display_label = toNullableString(assertion.value);
        estimatedDate.display_label = { sourceKind: 'manual', sourceId: assertion.id };
    } else if (field === 'estimated_date.most_likely_date') {
        projection.estimatedDate.most_likely_date = toNullableString(assertion.value);
        estimatedDate.most_likely_date = { sourceKind: 'manual', sourceId: assertion.id };
    } else if (field === 'estimated_date.min_date') {
        projection.estimatedDate.min_date = toNullableString(assertion.value);
        estimatedDate.min_date = { sourceKind: 'manual', sourceId: assertion.id };
    } else if (field === 'estimated_date.max_date') {
        projection.estimatedDate.max_date = toNullableString(assertion.value);
        estimatedDate.max_date = { sourceKind: 'manual', sourceId: assertion.id };
    } else {
        projection.estimatedDate.rationale = toNullableString(assertion.value);
        estimatedDate.rationale = { sourceKind: 'manual', sourceId: assertion.id };
    }
    promoteEstimatedDateIfFullyManual(provenance, assertion);
}

function applyQualityAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    const field = assertion.field_path;
    const quality = ensureQualityProvenance(provenance);
    if (field === 'quality.discard') {
        projection.quality.discard = typeof assertion.value === 'boolean' ? assertion.value : Boolean(assertion.value);
        quality.discard = { sourceKind: 'manual', sourceId: assertion.id };
    } else {
        const numericValue = typeof assertion.value === 'number' ? assertion.value : null;
        if (field === 'quality.technical') {
            projection.quality.technical = numericValue;
            quality.technical = { sourceKind: 'manual', sourceId: assertion.id };
        } else if (field === 'quality.lighting') {
            projection.quality.lighting = numericValue;
            quality.lighting = { sourceKind: 'manual', sourceId: assertion.id };
        } else if (field === 'quality.composition') {
            projection.quality.composition = numericValue;
            quality.composition = { sourceKind: 'manual', sourceId: assertion.id };
        } else {
            projection.quality.emotional = numericValue;
            quality.emotional = { sourceKind: 'manual', sourceId: assertion.id };
        }
    }
    promoteQualityIfFullyManual(provenance, assertion);
}

function applyAuthenticityAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    const authenticity = ensureAuthenticityProvenance(provenance);
    if (assertion.field_path === 'authenticity.score') {
        projection.authenticity.score = typeof assertion.value === 'number' ? assertion.value : null;
        authenticity.score = { sourceKind: 'manual', sourceId: assertion.id };
    } else {
        projection.authenticity.reasons = toStringArray(assertion.value);
        authenticity.reasons = { sourceKind: 'manual', sourceId: assertion.id };
    }
    promoteAuthenticityIfFullyManual(provenance, assertion);
}

type ResponseBundleApplier = (
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) => void;

function applyCaptionAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    projection.caption = toNullableString(assertion.value);
    setManualSource(provenance, 'caption', assertion.id);
}

function applyDescriptionAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    projection.description = toNullableString(assertion.value);
    setManualSource(provenance, 'description', assertion.id);
}

function applyLocationAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    projection.location = toNullableString(assertion.value);
    setManualSource(provenance, 'location', assertion.id);
}

function applyKeywordsAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    projection.keywords = toStringArray(assertion.value);
    setManualSource(provenance, 'keywords', assertion.id);
}

function applyEmotionalImpactAssertion(
    projection: PhotoMetadataProjection,
    provenance: BundleProvenance,
    assertion: PhotoMetadataAssertionRow,
) {
    projection.emotionalImpact = toNullableString(assertion.value);
    setManualSource(provenance, 'emotionalImpact', assertion.id);
}

const EXACT_RESPONSE_BUNDLE_APPLIERS: Record<string, ResponseBundleApplier> = {
    caption: applyCaptionAssertion,
    description: applyDescriptionAssertion,
    location: applyLocationAssertion,
    keywords: applyKeywordsAssertion,
    emotional_impact: applyEmotionalImpactAssertion,
};

const PREFIX_RESPONSE_BUNDLE_APPLIERS: Array<{ prefix: string; apply: ResponseBundleApplier }> = [
    { prefix: 'estimated_date.', apply: applyEstimatedDateAssertion },
    { prefix: 'quality.', apply: applyQualityAssertion },
    { prefix: 'authenticity.', apply: applyAuthenticityAssertion },
];

export function applyManualAssertionToResponseBundle(bundle: PhotoMetadataBundle, assertion: PhotoMetadataAssertionRow): PhotoMetadataBundle {
    const projection = cloneProjection(bundle.projection);
    const provenance = cloneProvenance(bundle);

    const exactApplier = EXACT_RESPONSE_BUNDLE_APPLIERS[assertion.field_path];
    if (exactApplier) {
        exactApplier(projection, provenance, assertion);
    } else {
        const prefixApplier = PREFIX_RESPONSE_BUNDLE_APPLIERS.find((rule) => assertion.field_path.startsWith(rule.prefix));
        prefixApplier?.apply(projection, provenance, assertion);
    }

    return {
        ...bundle,
        projection,
        provenance,
    };
}
