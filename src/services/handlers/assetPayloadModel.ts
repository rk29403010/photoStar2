import type { PhotoMetadataBundle, PhotoMetadataProjection, PhotoMetadataSourceSummary } from '../../boundary/contracts/core';
import {
    normalizePhotoMetadataRegionsOfInterest,
    normalizePhotoMetadataSubjects,
} from '../photoMetadata/coordinateNormalization';
import { normalizeStoredPhotoBox } from '../faces/faceImageGeometry';

export type AssetPayloadRow = {
    id: string;
    original_path: string;
    width: number | null;
    height: number | null;
    file_size: number | null;
    created_at: string | null;
    photo_created_at?: string | null;
    photo_created_at_confidence?: number | null;
    exif_datetime?: string | null;
    metadata_timestamp_source?: string | null;
    preview_path: string | null;
    faces_data: string | null;
    rec_data: string | null;
    ai_metadata_data: string | null;
    embedded_metadata_data?: string | null;
    people_data: string | null;
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
    sensitivity_score: number | null;
    sensitivity_status: string | null;
    member_group_id?: string | null;
    member_role?: string | null;
    member_rank?: number | null;
    member_match_evidence?: string | null;
    member_group_type?: string | null;
    stack_count?: number | null;
    group_memberships_json?: string | null;
};

type RawGroupMembership = {
    groupId?: string;
    groupRole?: string | null;
    stackCount?: number | null;
    role?: string | null;
    rank?: number | null;
    matchEvidence?: Record<string, unknown> | string | null;
    groupType?: string | null;
};

function parseFaces(row: AssetPayloadRow) {
    try {
        const parsedFaces = row.faces_data ? JSON.parse(row.faces_data).faces || [] : [];
        return Array.isArray(parsedFaces)
            ? parsedFaces.flatMap((face: Record<string, unknown>) => {
                const normalizedBox = normalizeStoredPhotoBox(face.box);
                return normalizedBox ? [{ ...face, box: normalizedBox } as Record<string, unknown>] : [];
            })
            : [];
    } catch {
        return [];
    }
}

function parsePeopleAssignments(row: AssetPayloadRow) {
    if (!row.people_data) {return [];}
    try {
        return JSON.parse(row.people_data).filter((person: { person_id: string | null }) => person.person_id !== null) as Array<{ face_index: number; person_id: string; name: string }>;
    } catch {
        return [];
    }
}

function applyPeopleAssignments(faces: Array<{ person_id?: string; person_name?: string }>, peopleData: Array<{ face_index: number; person_id: string; name: string }>) {
    faces.forEach((face, index) => {
        const assignment = peopleData.find((person) => person.face_index === index);
        if (!assignment) {return;}
        face.person_id = assignment.person_id;
        face.person_name = assignment.name;
    });
}

function parseAiMetadata(row: AssetPayloadRow) {
    if (!row.ai_metadata_data) {return undefined;}
    try {
        return JSON.parse(row.ai_metadata_data) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function parseEmbeddedMetadata(row: AssetPayloadRow) {
    if (!row.embedded_metadata_data) {return undefined;}
    try {
        return JSON.parse(row.embedded_metadata_data) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function parseFaceEmbeddings(row: AssetPayloadRow) {
    if (!row.rec_data) {return [];}
    try {
        return JSON.parse(row.rec_data).embeddings || [];
    } catch {
        return [];
    }
}

function parseJsonArray<T>(value: string | null) {
    if (!value) {return [] as T[];}
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
        return [];
    }
}

function parseJsonRecord<T extends Record<string, unknown>>(value: string | null) {
    if (!value) {return undefined;}
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : undefined;
    } catch {
        return undefined;
    }
}

function parseMatchEvidence(matchEvidence: string | null | undefined) {
    if (!matchEvidence) {return null;}
    try {
        return JSON.parse(matchEvidence) as Record<string, unknown>;
    } catch {
        return matchEvidence;
    }
}

function buildAssetFileFields(row: AssetPayloadRow) {
    return {
        id: row.id,
        original_path: row.original_path,
        width: row.width ?? undefined,
        height: row.height ?? undefined,
        file_size: row.file_size ?? undefined,
        created_at: row.created_at ?? undefined,
        photo_created_at: row.photo_created_at ?? null,
        photo_created_at_confidence: row.photo_created_at_confidence ?? null,
        exif_datetime: row.exif_datetime ?? null,
        metadata_timestamp_source: row.metadata_timestamp_source ?? null,
        preview_path: row.preview_path ?? undefined,
        sensitivity_score: row.sensitivity_score,
        sensitivity_status: row.sensitivity_status,
    };
}

function buildGroupFields(row: AssetPayloadRow) {
    const groupMemberships = parseGroupMemberships(row);
    return {
        group_id: row.member_group_id ?? null,
        group_role: row.member_role ?? null,
        stack_count: row.stack_count ?? null,
        role: row.member_role ?? null,
        rank: row.member_rank ?? null,
        match_evidence: parseMatchEvidence(row.member_match_evidence),
        group_memberships: groupMemberships,
    };
}

function buildFallbackGroupMembership(row: AssetPayloadRow) {
    if (!row.member_group_id) {return [];}

    return [{
        group_id: row.member_group_id,
        group_role: row.member_role ?? null,
        stack_count: row.stack_count ?? null,
        role: row.member_role ?? null,
        rank: row.member_rank ?? null,
        match_evidence: parseMatchEvidence(row.member_match_evidence),
        group_type: row.member_group_type ?? null,
    }];
}

function isValidGroupMembership(membership: RawGroupMembership) {
    return typeof membership.groupId === 'string' && membership.groupId.length > 0;
}

function toGroupMembership(membership: RawGroupMembership) {
    return {
        group_id: membership.groupId!,
        group_role: membership.groupRole ?? null,
        stack_count: membership.stackCount ?? null,
        role: membership.role ?? null,
        rank: membership.rank ?? null,
        match_evidence: membership.matchEvidence ?? null,
        group_type: membership.groupType ?? null,
    };
}

function parseGroupMembershipsJson(groupMembershipsJson: string) {
    try {
        return JSON.parse(groupMembershipsJson) as RawGroupMembership[];
    } catch {
        return [];
    }
}

function parseGroupMemberships(row: AssetPayloadRow) {
    if (!row.group_memberships_json) {return buildFallbackGroupMembership(row);}

    return parseGroupMembershipsJson(row.group_memberships_json)
        .filter(isValidGroupMembership)
        .map(toGroupMembership);
}

function toSourceSummary(sourceKind: string | null, sourceId: string | null): PhotoMetadataSourceSummary {
    return { sourceKind, sourceId };
}

function parseQualityDiscard(value: number | null) {
    if (value === null) {return null;}
    return value === 1;
}

function toPhotoMetadataProjection(row: AssetPayloadRow): PhotoMetadataProjection {
    return {
        assetId: row.id,
        type: row.type,
        caption: row.caption,
        description: row.description,
        location: row.location,
        estimatedDate: {
            most_likely_date: row.estimated_date_most_likely,
            min_date: row.estimated_date_min,
            max_date: row.estimated_date_max,
            display_label: row.estimated_date_display_label,
            rationale: row.estimated_date_rationale,
        },
        keywords: parseJsonArray<string>(row.keywords_json),
        emotionalImpact: row.emotional_impact,
        quality: {
            technical: row.quality_technical,
            lighting: row.quality_lighting,
            composition: row.quality_composition,
            emotional: row.quality_emotional,
            discard: parseQualityDiscard(row.quality_discard),
        },
        recommendedEnhancements: parseJsonArray<string>(row.recommended_enhancements_json),
        authenticity: {
            score: row.authenticity_score,
            reasons: parseJsonArray<string>(row.authenticity_reasons_json),
        },
        subjects: normalizePhotoMetadataSubjects(parseJsonArray<unknown>(row.subjects_json)),
        regionsOfInterest: normalizePhotoMetadataRegionsOfInterest(parseJsonArray<unknown>(row.regions_of_interest_json)),
    };
}

function toPhotoMetadataBundle(row: AssetPayloadRow): PhotoMetadataBundle {
    return {
        projection: toPhotoMetadataProjection(row),
        provenance: {
            type: toSourceSummary(row.type_source_kind, row.type_source_id),
            caption: toSourceSummary(row.caption_source_kind, row.caption_source_id),
            description: toSourceSummary(row.description_source_kind, row.description_source_id),
            location: toSourceSummary(row.location_source_kind, row.location_source_id),
            estimatedDate: toSourceSummary(row.estimated_date_source_kind, row.estimated_date_source_id),
            keywords: toSourceSummary(row.keywords_source_kind, row.keywords_source_id),
            emotionalImpact: toSourceSummary(row.emotional_impact_source_kind, row.emotional_impact_source_id),
            quality: toSourceSummary(row.quality_source_kind, row.quality_source_id),
            recommendedEnhancements: toSourceSummary(row.recommended_enhancements_source_kind, row.recommended_enhancements_source_id),
            authenticity: toSourceSummary(row.authenticity_source_kind, row.authenticity_source_id),
            subjects: toSourceSummary(row.subjects_source_kind, row.subjects_source_id),
            regionsOfInterest: toSourceSummary(row.regions_of_interest_source_kind, row.regions_of_interest_source_id),
        },
    };
}

function toPhotoMetadataEvidence(row: AssetPayloadRow) {
    const machineBlocks: Array<{ kind: string; data: Record<string, unknown> }> = [];
    const aiMetadata = parseJsonRecord<Record<string, unknown>>(row.ai_metadata_data);
    if (aiMetadata) {machineBlocks.push({ kind: 'ai_metadata', data: aiMetadata });}

    const embeddedMetadata = parseJsonRecord<Record<string, unknown>>(row.embedded_metadata_data ?? null);
    if (embeddedMetadata) {machineBlocks.push({ kind: 'embedded_metadata', data: embeddedMetadata });}

    return {
        machineBlocks,
        manualAssertions: [],
    };
}

export function toAssetPayload(row: AssetPayloadRow, options: { includeEvidence?: boolean } = {}) {
    const faces = parseFaces(row);
    applyPeopleAssignments(faces, parsePeopleAssignments(row));
    const includeEvidence = options.includeEvidence === true;
    const photoMetadata = toPhotoMetadataBundle(row);

    return {
        ...buildAssetFileFields(row),
        caption: row.caption ?? undefined,
        faces,
        face_embeddings: parseFaceEmbeddings(row),
        photo_metadata: includeEvidence
            ? { ...photoMetadata, evidence: toPhotoMetadataEvidence(row) }
            : photoMetadata,
        ai_metadata: includeEvidence ? parseAiMetadata(row) : undefined,
        embedded_metadata: includeEvidence ? parseEmbeddedMetadata(row) : undefined,
        ...buildGroupFields(row),
    };
}
