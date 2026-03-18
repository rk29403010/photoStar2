export type GroupFieldFragments = {
    memberGroupIdSelect: string;
    memberRoleSelect: string;
    memberRankSelect: string;
    memberMatchEvidenceSelect: string;
    memberGroupTypeSelect: string;
    stackCountSelect: string;
    groupMembershipsSelect: string;
};

const PRIMARY_GROUP_ORDER = `
    CASE WHEN gm.role = 'canonical' THEN 0 ELSE 1 END,
    COALESCE(gm.rank, 999999),
    gm.group_id
`;

export function buildGroupFieldFragments(assetAlias: string): GroupFieldFragments {
    const primaryMembershipFrom = `
        FROM asset_group_members gm
        LEFT JOIN asset_groups ag ON ag.id = gm.group_id
        LEFT JOIN GroupCounts gc ON gc.group_id = gm.group_id
        WHERE gm.asset_id = ${assetAlias}.id
        ORDER BY ${PRIMARY_GROUP_ORDER}
        LIMIT 1
    `;

    return {
        memberGroupIdSelect: `(
            SELECT gm.group_id
            ${primaryMembershipFrom}
        ) as member_group_id,`,
        memberRoleSelect: `(
            SELECT gm.role
            ${primaryMembershipFrom}
        ) as member_role,`,
        memberRankSelect: `(
            SELECT gm.rank
            ${primaryMembershipFrom}
        ) as member_rank,`,
        memberMatchEvidenceSelect: `(
            SELECT gm.evidence_json
            ${primaryMembershipFrom}
        ) as member_match_evidence,`,
        memberGroupTypeSelect: `(
            SELECT ag.type
            ${primaryMembershipFrom}
        ) as member_group_type,`,
        stackCountSelect: `(
            SELECT gc.stack_count
            ${primaryMembershipFrom}
        ) as stack_count,`,
        groupMembershipsSelect: `(
            SELECT json_group_array(json_object(
                'groupId', gm.group_id,
                'groupRole', gm.role,
                'stackCount', COALESCE(gc.stack_count, 0),
                'role', gm.role,
                'rank', gm.rank,
                'matchEvidence', CASE
                    WHEN gm.evidence_json IS NULL OR gm.evidence_json = '' THEN null
                    ELSE json(gm.evidence_json)
                END,
                'groupType', ag.type
            ))
            FROM asset_group_members gm
            LEFT JOIN asset_groups ag ON ag.id = gm.group_id
            LEFT JOIN GroupCounts gc ON gc.group_id = gm.group_id
            WHERE gm.asset_id = ${assetAlias}.id
            ORDER BY ${PRIMARY_GROUP_ORDER}
        ) as group_memberships_json,`,
    };
}
