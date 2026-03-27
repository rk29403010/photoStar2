import type { PhotoMetadataBundle, PhotoMetadataProjection, PhotoMetadataProjectionAuthenticity, PhotoMetadataProjectionDate, PhotoMetadataProjectionQuality, PhotoMetadataSourceSummary } from '../../boundary/contracts/core';
import type { PhotoMetadataAssertionRow, PhotoMetadataBlockRow, PhotoMetadataProjectionRow } from './repository';

type PhotoMetadataRepositoryLike = {
    loadProjection(assetId: string): PhotoMetadataProjectionRow | null;
    listBlocksForAsset(assetId: string): PhotoMetadataBlockRow[];
};

type ManualAssertionsServiceLike = {
    listManualAssertions(assetId: string): PhotoMetadataAssertionRow[];
};

function toEmptyProjection(assetId: string): PhotoMetadataProjection {
    return {
        assetId,
        type: null,
        caption: null,
        description: null,
        location: null,
        estimatedDate: {
            most_likely_date: null,
            min_date: null,
            max_date: null,
            display_label: null,
            rationale: null,
        },
        keywords: [],
        emotionalImpact: null,
        quality: {
            technical: null,
            lighting: null,
            composition: null,
            emotional: null,
            discard: null,
        },
        recommendedEnhancements: [],
        authenticity: {
            score: null,
            reasons: [],
        },
        subjects: [],
        regionsOfInterest: [],
    };
}

function toSourceSummary(kind: string | null, id: string | null): PhotoMetadataSourceSummary {
    return { sourceKind: kind, sourceId: id };
}

function toNullableString(value: string | null | undefined): string | null {
    return value ?? null;
}

function toNullableNumber(value: number | null | undefined): number | null {
    return value ?? null;
}

function toNullableQualityDiscard(value: number | null | undefined): boolean | null {
    if (value === null || value === undefined) {
        return null;
    }

    return value === 1;
}

function toProjectionDate(row: PhotoMetadataProjectionRow | null): PhotoMetadataProjectionDate {
    return {
        most_likely_date: toNullableString(row?.estimated_date_most_likely),
        min_date: toNullableString(row?.estimated_date_min),
        max_date: toNullableString(row?.estimated_date_max),
        display_label: toNullableString(row?.estimated_date_display_label),
        rationale: toNullableString(row?.estimated_date_rationale),
    };
}

function toProjectionQuality(row: PhotoMetadataProjectionRow | null): PhotoMetadataProjectionQuality {
    return {
        technical: toNullableNumber(row?.quality_technical),
        lighting: toNullableNumber(row?.quality_lighting),
        composition: toNullableNumber(row?.quality_composition),
        emotional: toNullableNumber(row?.quality_emotional),
        discard: toNullableQualityDiscard(row?.quality_discard),
    };
}

function toProjectionAuthenticity(row: PhotoMetadataProjectionRow | null): PhotoMetadataProjectionAuthenticity {
    return {
        score: row?.authenticity_score ?? null,
        reasons: row?.authenticity_reasons_json ? JSON.parse(row.authenticity_reasons_json) as string[] : [],
    };
}

function parseJsonArray<T>(value: string | null): T[] {
    if (!value) {return [];}
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
        return [];
    }
}

function toPhotoMetadataProjection(row: PhotoMetadataProjectionRow | null, assetId: string): PhotoMetadataProjection {
    if (!row) {
        return toEmptyProjection(assetId);
    }

    return {
        assetId,
        type: row.type,
        caption: row.caption,
        description: row.description,
        location: row.location,
        estimatedDate: toProjectionDate(row),
        keywords: parseJsonArray<string>(row.keywords_json),
        emotionalImpact: row.emotional_impact,
        quality: toProjectionQuality(row),
        recommendedEnhancements: parseJsonArray<string>(row.recommended_enhancements_json),
        authenticity: toProjectionAuthenticity(row),
        subjects: parseJsonArray<unknown>(row.subjects_json),
        regionsOfInterest: parseJsonArray<unknown>(row.regions_of_interest_json),
    };
}

export function buildPhotoMetadataBundle(params: {
    repository: PhotoMetadataRepositoryLike;
    manualAssertionsService: ManualAssertionsServiceLike;
    assetId: string;
    includeEvidence: boolean;
}): PhotoMetadataBundle {
    const projectionRow = params.repository.loadProjection(params.assetId);
    const provenance = projectionRow
        ? {
            type: toSourceSummary(projectionRow.type_source_kind, projectionRow.type_source_id),
            caption: toSourceSummary(projectionRow.caption_source_kind, projectionRow.caption_source_id),
            description: toSourceSummary(projectionRow.description_source_kind, projectionRow.description_source_id),
            location: toSourceSummary(projectionRow.location_source_kind, projectionRow.location_source_id),
            estimatedDate: toSourceSummary(projectionRow.estimated_date_source_kind, projectionRow.estimated_date_source_id),
            keywords: toSourceSummary(projectionRow.keywords_source_kind, projectionRow.keywords_source_id),
            emotionalImpact: toSourceSummary(projectionRow.emotional_impact_source_kind, projectionRow.emotional_impact_source_id),
            quality: toSourceSummary(projectionRow.quality_source_kind, projectionRow.quality_source_id),
            recommendedEnhancements: toSourceSummary(projectionRow.recommended_enhancements_source_kind, projectionRow.recommended_enhancements_source_id),
            authenticity: toSourceSummary(projectionRow.authenticity_source_kind, projectionRow.authenticity_source_id),
            subjects: toSourceSummary(projectionRow.subjects_source_kind, projectionRow.subjects_source_id),
            regionsOfInterest: toSourceSummary(projectionRow.regions_of_interest_source_kind, projectionRow.regions_of_interest_source_id),
        }
        : undefined;

    const bundle: PhotoMetadataBundle = {
        projection: toPhotoMetadataProjection(projectionRow, params.assetId),
        provenance,
    };

    if (params.includeEvidence) {
        bundle.evidence = {
            machineBlocks: params.repository.listBlocksForAsset(params.assetId),
            manualAssertions: params.manualAssertionsService.listManualAssertions(params.assetId),
        };
    }

    return bundle;
}
