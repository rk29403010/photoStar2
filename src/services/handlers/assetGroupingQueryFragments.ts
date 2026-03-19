export type GroupFieldFragments = {
    memberGroupIdSelect: string;
    memberRoleSelect: string;
    memberRankSelect: string;
    memberMatchEvidenceSelect: string;
    memberGroupTypeSelect: string;
    stackCountSelect: string;
    groupMembershipsSelect: string;
};

export const GROUP_HIERARCHY_CTE = `
    WITH RECURSIVE GroupClosure(root_group_id, group_id) AS (
        SELECT id, id
        FROM asset_groups

        UNION ALL

        SELECT gc.root_group_id, agc.child_group_id
        FROM GroupClosure gc
        JOIN asset_group_children agc ON agc.parent_group_id = gc.group_id
    ),
    GroupCounts AS (
        SELECT
            gc.root_group_id AS group_id,
            COUNT(DISTINCT gm.asset_id) AS stack_count
        FROM GroupClosure gc
        LEFT JOIN asset_group_members gm ON gm.group_id = gc.group_id
        GROUP BY gc.root_group_id
    ),
    AssetMembershipTree(asset_id, group_id, depth) AS (
        SELECT gm.asset_id, gm.group_id, 0
        FROM asset_group_members gm

        UNION ALL

        SELECT amt.asset_id, agc.parent_group_id, amt.depth + 1
        FROM AssetMembershipTree amt
        JOIN asset_group_children agc ON agc.child_group_id = amt.group_id
    ),
    AssetResolvedMemberships AS (
        SELECT
            asset_id,
            group_id,
            MAX(depth) AS depth
        FROM AssetMembershipTree
        GROUP BY asset_id, group_id
    )
`;

function buildGroupTypeOrder(groupTypeExpression: string): string {
    return `
        CASE ${groupTypeExpression}
            WHEN 'burst' THEN 0
            WHEN 'variant_set' THEN 1
            WHEN 'near_duplicate' THEN 2
            WHEN 'duplicate' THEN 3
            ELSE 4
        END
    `;
}

function buildResolvedRoleExpression(assetIdExpression: string): string {
    return `
        CASE
            WHEN gm.role IS NOT NULL THEN gm.role
            WHEN ag.canonical_asset_id = ${assetIdExpression} THEN 'canonical'
            ELSE 'member'
        END
    `;
}

function buildOrderedMembershipSelect(assetAlias: string, fieldExpression: string): string {
    const resolvedRole = buildResolvedRoleExpression('arm.asset_id');
    const groupTypeOrder = buildGroupTypeOrder('ag.type');

    return `(
        SELECT ${fieldExpression}
        FROM AssetResolvedMemberships arm
        JOIN asset_groups ag ON ag.id = arm.group_id
        LEFT JOIN asset_group_members gm
            ON gm.group_id = arm.group_id
           AND gm.asset_id = arm.asset_id
        LEFT JOIN GroupCounts gc ON gc.group_id = arm.group_id
        WHERE arm.asset_id = ${assetAlias}.id
        ORDER BY
            ${groupTypeOrder},
            arm.depth DESC,
            CASE ${resolvedRole} WHEN 'canonical' THEN 0 ELSE 1 END,
            COALESCE(gm.rank, 999999),
            arm.group_id
        LIMIT 1
    )`;
}

export function buildPrimaryGroupVisibilityPredicate(assetAlias: string): string {
    return `COALESCE(${buildOrderedMembershipSelect(assetAlias, buildResolvedRoleExpression('arm.asset_id'))}, 'canonical') = 'canonical'`;
}

export function buildGroupFieldFragments(assetAlias: string): GroupFieldFragments {
    const resolvedRole = buildResolvedRoleExpression('arm.asset_id');
    const groupTypeOrder = buildGroupTypeOrder('ag.type');

    return {
        memberGroupIdSelect: `${buildOrderedMembershipSelect(assetAlias, 'arm.group_id')} as member_group_id,`,
        memberRoleSelect: `${buildOrderedMembershipSelect(assetAlias, resolvedRole)} as member_role,`,
        memberRankSelect: `${buildOrderedMembershipSelect(assetAlias, 'gm.rank')} as member_rank,`,
        memberMatchEvidenceSelect: `${buildOrderedMembershipSelect(assetAlias, 'gm.evidence_json')} as member_match_evidence,`,
        memberGroupTypeSelect: `${buildOrderedMembershipSelect(assetAlias, 'ag.type')} as member_group_type,`,
        stackCountSelect: `${buildOrderedMembershipSelect(assetAlias, 'COALESCE(gc.stack_count, 0)')} as stack_count,`,
        groupMembershipsSelect: `(
            SELECT json_group_array(json_object(
                'groupId', arm.group_id,
                'groupRole', ${resolvedRole},
                'stackCount', COALESCE(gc.stack_count, 0),
                'role', ${resolvedRole},
                'rank', gm.rank,
                'matchEvidence', CASE
                    WHEN gm.evidence_json IS NULL OR gm.evidence_json = '' THEN null
                    ELSE json(gm.evidence_json)
                END,
                'groupType', ag.type
            ))
            FROM AssetResolvedMemberships arm
            JOIN asset_groups ag ON ag.id = arm.group_id
            LEFT JOIN asset_group_members gm
                ON gm.group_id = arm.group_id
               AND gm.asset_id = arm.asset_id
            LEFT JOIN GroupCounts gc ON gc.group_id = arm.group_id
            WHERE arm.asset_id = ${assetAlias}.id
            ORDER BY
                ${groupTypeOrder},
                arm.depth DESC,
                CASE ${resolvedRole} WHEN 'canonical' THEN 0 ELSE 1 END,
                COALESCE(gm.rank, 999999),
                arm.group_id
        ) as group_memberships_json,`,
    };
}
