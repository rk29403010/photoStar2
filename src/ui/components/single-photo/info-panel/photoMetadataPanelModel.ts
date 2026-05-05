import type {
    Asset,
    PhotoMetadataBundle,
    PhotoMetadataEvidencePayload,
    PhotoMetadataProjection,
    PhotoMetadataSourceSummary,
} from '@contracts/core';

type SubjectRecord = Record<string, unknown>;

export type FilePanelSummary = {
    caption: string | null;
    captionSourceLabel?: string;
    type: string | null;
    typeSourceLabel?: string;
    location: string | null;
    locationSourceLabel?: string;
    estimatedDateLabel: string | null;
    estimatedDateRangeLabel: string | null;
    estimatedDateSourceLabel?: string;
    dateRationale: string | null;
}

export type AnalysisPanelSummary = {
    caption: string | null;
    captionSourceLabel?: string;
    description: string | null;
    descriptionSourceLabel?: string;
    emotionalImpact: string | null;
    emotionalImpactSourceLabel?: string;
}

export type PeoplePanelSubjectSummary = {
    label: string;
    suggestedNames: string[];
    uniform?: string;
    features?: string;
    dobRange?: string;
    gender?: string;
    ageRange?: string;
    emotion?: string;
    locationDescription?: string;
    animalType?: string;
    boundingBox?: unknown;
    type?: string;
    sourceLabel?: string;
    raw: SubjectRecord;
}

export type PeoplePanelSummary = {
    subjects: PeoplePanelSubjectSummary[];
}

function getProjection(asset: Asset): PhotoMetadataProjection | null {
    return asset.photo_metadata?.projection ?? null;
}

function getAiMetadataString(asset: Asset, key: string): string | null {
    return getOptionalString(asset.ai_metadata?.[key]) ?? null;
}

function getProvenance(asset: Asset): PhotoMetadataBundle['provenance'] | undefined {
    return asset.photo_metadata?.provenance;
}

function getEvidence(asset: Asset): PhotoMetadataEvidencePayload | undefined {
    return asset.photo_metadata?.evidence;
}

function getOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function getStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        : [];
}

function getSubjectRecord(value: unknown): SubjectRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as SubjectRecord
        : null;
}

function lookupManualAuthor(params: {
    source: PhotoMetadataSourceSummary | undefined;
    evidence: PhotoMetadataEvidencePayload | undefined;
}): string | undefined {
    if (!params.source?.sourceId || !params.evidence) {
        return undefined;
    }

    const assertion = params.evidence.manualAssertions.find((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
            return false;
        }

        return (candidate as { id?: string }).id === params.source?.sourceId;
    });

    return assertion && typeof assertion === 'object'
        ? getOptionalString((assertion as { user_id?: unknown }).user_id)
        : undefined;
}

function getBaseSourceLabel(sourceKind: string | null | undefined): string | undefined {
    switch (sourceKind) {
        case null:
        case undefined:
            return undefined;
        case 'gemini_pro_refined':
            return 'Pro refined';
        case 'gemini_flash_scout':
            return 'Flash scout';
        case 'manual':
        case 'manual_user':
            return 'Manual';
    }

    return undefined;
}

export function buildPhotoMetadataSourceLabel(params: {
    source: PhotoMetadataSourceSummary | undefined;
    evidence: PhotoMetadataEvidencePayload | undefined;
}): string | undefined {
    const baseLabel = getBaseSourceLabel(params.source?.sourceKind);
    if (!baseLabel) {
        return undefined;
    }

    if (baseLabel !== 'Manual') {
        return baseLabel;
    }

    const author = lookupManualAuthor(params);
    return author ? `${baseLabel} · ${author}` : baseLabel;
}

function getResolvedCaption(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.caption ?? getAiMetadataString(asset, 'caption');
}

function getResolvedType(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.type ?? getAiMetadataString(asset, 'type');
}

function getResolvedLocation(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.location ?? getAiMetadataString(asset, 'location');
}

function getResolvedEstimatedDateLabel(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.estimatedDate.display_label ?? getAiMetadataString(asset, 'estimated_date');
}

function formatDateOnly(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    }).format(parsed);
}

function getResolvedEstimatedDateRangeLabel(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    const projectionStart = formatDateOnly(projection?.estimatedDate.min_date);
    const projectionEnd = formatDateOnly(projection?.estimatedDate.max_date);
    const estimateStart = formatDateOnly(asset.photo_date_estimate?.range.start);
    const estimateEnd = formatDateOnly(asset.photo_date_estimate?.range.end);
    const start = projectionStart ?? estimateStart;
    const end = projectionEnd ?? estimateEnd;

    if (!start || !end) {
        return null;
    }

    if (start === end) {
        return start;
    }

    return `${start} to ${end}`;
}

function getAnalysisCaption(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.caption ?? getAiMetadataString(asset, 'caption') ?? getOptionalString(asset.caption) ?? null;
}

function getAnalysisDescription(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.description ?? getAiMetadataString(asset, 'description');
}

function getAnalysisEmotionalImpact(asset: Asset, projection: PhotoMetadataProjection | null): string | null {
    return projection?.emotionalImpact ?? getAiMetadataString(asset, 'emotional_impact');
}

export function buildPhotoMetadataFileSummary(asset: Asset): FilePanelSummary {
    const projection = getProjection(asset);
    const provenance = getProvenance(asset);
    const evidence = getEvidence(asset);
    const estimatedDateSource = provenance?.estimatedDate?.display_label ?? provenance?.estimatedDate;

    return {
        caption: getResolvedCaption(asset, projection),
        captionSourceLabel: buildPhotoMetadataSourceLabel({ source: provenance?.caption, evidence }),
        type: getResolvedType(asset, projection),
        typeSourceLabel: buildPhotoMetadataSourceLabel({ source: provenance?.type, evidence }),
        location: getResolvedLocation(asset, projection),
        locationSourceLabel: buildPhotoMetadataSourceLabel({ source: provenance?.location, evidence }),
        estimatedDateLabel: getResolvedEstimatedDateLabel(asset, projection),
        estimatedDateRangeLabel: getResolvedEstimatedDateRangeLabel(asset, projection),
        estimatedDateSourceLabel: buildPhotoMetadataSourceLabel({ source: estimatedDateSource, evidence }),
        dateRationale: projection?.estimatedDate.rationale ?? null,
    };
}

export function buildPhotoMetadataAnalysisSummary(asset: Asset): AnalysisPanelSummary {
    const projection = getProjection(asset);
    const provenance = getProvenance(asset);
    const evidence = getEvidence(asset);

    return {
        caption: getAnalysisCaption(asset, projection),
        captionSourceLabel: buildPhotoMetadataSourceLabel({ source: provenance?.caption, evidence }),
        description: getAnalysisDescription(asset, projection),
        descriptionSourceLabel: buildPhotoMetadataSourceLabel({ source: provenance?.description, evidence }),
        emotionalImpact: getAnalysisEmotionalImpact(asset, projection),
        emotionalImpactSourceLabel: buildPhotoMetadataSourceLabel({ source: provenance?.emotionalImpact, evidence }),
    };
}

function buildSubjectSummary(params: {
    subject: SubjectRecord;
    index: number;
    sourceLabel?: string;
}): PeoplePanelSubjectSummary {
    return {
        label: getOptionalString(params.subject.label) ?? `Subject ${params.index + 1}`,
        suggestedNames: getStringArray(params.subject.suggested_names ?? params.subject.names),
        uniform: getOptionalString(params.subject.uniform),
        features: getOptionalString(params.subject.features),
        dobRange: getOptionalString(params.subject.dob_range),
        gender: getOptionalString(params.subject.gender),
        ageRange: getOptionalString(params.subject.age_range),
        emotion: getOptionalString(params.subject.emotion),
        locationDescription: getOptionalString(params.subject.location_desc),
        animalType: getOptionalString(params.subject.animal_type),
        boundingBox: params.subject.bounding_box,
        type: getOptionalString(params.subject.type),
        sourceLabel: params.sourceLabel,
        raw: params.subject,
    };
}

export function buildPhotoMetadataPeopleSummary(asset: Asset): PeoplePanelSummary {
    const projection = getProjection(asset);
    const provenance = getProvenance(asset);
    const evidence = getEvidence(asset);
    const sourceLabel = buildPhotoMetadataSourceLabel({ source: provenance?.subjects, evidence });
    const subjects = (projection?.subjects ?? [])
        .map(getSubjectRecord)
        .filter((subject): subject is SubjectRecord => subject !== null)
        .map((subject, index) => buildSubjectSummary({ subject, index, sourceLabel }));

    return { subjects };
}
