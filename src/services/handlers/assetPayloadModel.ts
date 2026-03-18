export type AssetPayloadRow = {
    id: string;
    original_path: string;
    width: number | null;
    height: number | null;
    file_size: number | null;
    created_at: string | null;
    preview_path: string | null;
    faces_data: string | null;
    rec_data: string | null;
    ai_metadata_data: string | null;
    people_data: string | null;
    caption: string | null;
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
        return row.faces_data ? JSON.parse(row.faces_data).faces || [] : [];
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

function parseFaceEmbeddings(row: AssetPayloadRow) {
    if (!row.rec_data) {return [];}
    try {
        return JSON.parse(row.rec_data).embeddings || [];
    } catch {
        return [];
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

function resolveCaption(row: AssetPayloadRow, aiMeta: Record<string, unknown> | undefined) {
    if (row.caption) {
        return row.caption;
    }

    return typeof aiMeta?.caption === 'string' ? aiMeta.caption : undefined;
}

export function toAssetPayload(row: AssetPayloadRow) {
    const faces = parseFaces(row);
    applyPeopleAssignments(faces, parsePeopleAssignments(row));
    const aiMeta = parseAiMetadata(row);

    return {
        ...buildAssetFileFields(row),
        faces,
        face_embeddings: parseFaceEmbeddings(row),
        ai_metadata: aiMeta,
        caption: resolveCaption(row, aiMeta),
        ...buildGroupFields(row),
    };
}
