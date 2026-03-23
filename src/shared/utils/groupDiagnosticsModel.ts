import type {
    GroupDiagnosticsAssetRow,
    GroupDiagnosticsChildRow,
    GroupDiagnosticsFlag,
    GroupDiagnosticsGroupRow,
    GroupDiagnosticsMembershipGroupRow,
    GroupDiagnosticsReport,
} from '@contracts/groupDiagnostics';

type AssetRecord = {
    assetId: string;
    originalPath: string;
    previewPath: string | null;
    groupIds: string[];
};

type GroupRecord = {
    groupId: string;
    groupType: string;
    representativeAssetId: string | null;
    assetIds: string[];
    childGroupIds: string[];
};

const GROUP_TYPE_ORDER: Record<string, number> = {
    duplicate: 0,
    near_duplicate: 1,
    variant_set: 2,
    burst: 3,
    people: 4,
};

function getGroupTypeRank(groupType: string) {
    return GROUP_TYPE_ORDER[groupType] ?? Number.MAX_SAFE_INTEGER;
}

function buildGroupAssetRows(params: {
    assetIds: string[];
    assetsById: Map<string, AssetRecord>;
    groupsById: Map<string, GroupRecord>;
}): GroupDiagnosticsAssetRow[] {
    const { assetIds, assetsById, groupsById } = params;
    return assetIds.flatMap((assetId) => {
        const asset = assetsById.get(assetId);
        if (!asset) {return [];}
        return [{
            assetId,
            originalPath: asset.originalPath,
            previewPath: asset.previewPath,
            membershipCount: asset.groupIds.length,
            groupIds: asset.groupIds,
            groups: buildMembershipGroups({ groupIds: asset.groupIds, groupsById, assetsById }),
        }];
    });
}

function buildRepresentativePreviewPath(params: {
    representativeAssetId: string | null;
    assetsById: Map<string, AssetRecord>;
}) {
    const representativeAssetId = params.representativeAssetId;
    if (!representativeAssetId) {
        return null;
    }

    return params.assetsById.get(representativeAssetId)?.previewPath ?? null;
}

function buildMembershipGroup(params: {
    group: GroupRecord;
    assetsById: Map<string, AssetRecord>;
}): GroupDiagnosticsMembershipGroupRow {
    return {
        groupId: params.group.groupId,
        groupType: params.group.groupType,
        representativeAssetId: params.group.representativeAssetId,
        representativePreviewPath: buildRepresentativePreviewPath({
            representativeAssetId: params.group.representativeAssetId,
            assetsById: params.assetsById,
        }),
    };
}

function buildMembershipGroups(params: {
    groupIds: string[];
    groupsById: Map<string, GroupRecord>;
    assetsById: Map<string, AssetRecord>;
}) {
    return params.groupIds.flatMap((groupId) => {
        const group = params.groupsById.get(groupId);
        if (!group) {
            return [];
        }

        return [buildMembershipGroup({ group, assetsById: params.assetsById })];
    });
}

function buildUnderlyingKeys(params: {
    groupType: string;
    assetRows: GroupDiagnosticsAssetRow[];
    groupTypesById: Map<string, string>;
}) {
    const { groupType, assetRows, groupTypesById } = params;
    const currentRank = getGroupTypeRank(groupType);

    return assetRows.map((asset) => {
        const lowerLevelGroupIds = asset.groupIds
            .filter((groupId) => getGroupTypeRank(groupTypesById.get(groupId) ?? '') < currentRank)
            .sort();
        return lowerLevelGroupIds[0] ?? asset.assetId;
    });
}

function buildGroupFlags(params: {
    descendantFileCount: number;
    overlapCount: number;
    underlyingImageEstimate: number;
}): GroupDiagnosticsFlag[] {
    const { descendantFileCount, overlapCount, underlyingImageEstimate } = params;
    const flags: GroupDiagnosticsFlag[] = [];

    if (overlapCount > 0) {
        flags.push('multi_group_overlap');
    }
    if (underlyingImageEstimate < descendantFileCount) {
        flags.push('overcount_on_collapse');
    }

    return flags;
}

function buildGroupSummary(params: {
    fileCount: number;
    descendantFileCount: number;
    directChildGroupCount: number;
    underlyingImageEstimate: number;
    overlapCount: number;
}) {
    const {
        fileCount,
        descendantFileCount,
        directChildGroupCount,
        underlyingImageEstimate,
        overlapCount,
    } = params;
    const directFileSummary = directChildGroupCount > 0
        ? `${descendantFileCount} descendant files`
        : `${fileCount} files`;
    return `${directFileSummary}, ${underlyingImageEstimate} underlying image${underlyingImageEstimate === 1 ? '' : 's'}, ${overlapCount} overlapping member${overlapCount === 1 ? '' : 's'}`;
}

function buildGroupChildren(params: {
    childGroupIds: string[];
    groupsById: Map<string, GroupRecord>;
    descendantCountsByGroupId: Map<string, number>;
    assetsById: Map<string, AssetRecord>;
}): GroupDiagnosticsChildRow[] {
    return params.childGroupIds.flatMap((childGroupId) => {
        const childGroup = params.groupsById.get(childGroupId);
        if (!childGroup) {
            return [];
        }

        return [{
            groupId: childGroup.groupId,
            groupType: childGroup.groupType,
            representativeAssetId: childGroup.representativeAssetId,
            representativePreviewPath: buildRepresentativePreviewPath({
                representativeAssetId: childGroup.representativeAssetId,
                assetsById: params.assetsById,
            }),
            descendantFileCount: params.descendantCountsByGroupId.get(childGroupId) ?? childGroup.assetIds.length,
        }];
    });
}

function buildDescendantAssetIds(
    groupId: string,
    groupsById: Map<string, GroupRecord>,
    descendantAssetIdsByGroupId: Map<string, string[]>,
    activeGroupIds: Set<string>,
): string[] {
    const cachedAssetIds = descendantAssetIdsByGroupId.get(groupId);
    if (cachedAssetIds) {
        return cachedAssetIds;
    }

    const group = groupsById.get(groupId);
    if (!group || activeGroupIds.has(groupId)) {
        return [];
    }

    activeGroupIds.add(groupId);
    const descendantAssetIds = [
        ...group.assetIds,
        ...group.childGroupIds.flatMap((childGroupId) => (
            buildDescendantAssetIds(childGroupId, groupsById, descendantAssetIdsByGroupId, activeGroupIds)
        )),
    ];
    activeGroupIds.delete(groupId);

    const uniqueAssetIds = [...new Set(descendantAssetIds)];
    descendantAssetIdsByGroupId.set(groupId, uniqueAssetIds);
    return uniqueAssetIds;
}

function buildGroupRows(params: {
    assetsById: Map<string, AssetRecord>;
    groupsById: Map<string, GroupRecord>;
    groupTypesById: Map<string, string>;
}): GroupDiagnosticsGroupRow[] {
    const { assetsById, groupsById, groupTypesById } = params;
    const rows: GroupDiagnosticsGroupRow[] = [];
    const descendantAssetIdsByGroupId = new Map<string, string[]>();
    const descendantCountsByGroupId = new Map<string, number>();

    for (const group of groupsById.values()) {
        const descendantAssetIds = buildDescendantAssetIds(
            group.groupId,
            groupsById,
            descendantAssetIdsByGroupId,
            new Set<string>(),
        );
        descendantCountsByGroupId.set(group.groupId, descendantAssetIds.length);
    }

    for (const group of groupsById.values()) {
        const assets = buildGroupAssetRows({ assetIds: group.assetIds, assetsById, groupsById });
        const overlapCount = assets.filter((asset) => asset.membershipCount > 1).length;
        const underlyingKeys = buildUnderlyingKeys({
            groupType: group.groupType,
            assetRows: assets,
            groupTypesById,
        });
        const descendantFileCount = descendantCountsByGroupId.get(group.groupId) ?? assets.length;
        const underlyingImageEstimate = group.childGroupIds.length > 0
            ? group.childGroupIds.length + group.assetIds.length
            : new Set(underlyingKeys).size;
        const fileCount = assets.length;
        const flags = buildGroupFlags({ descendantFileCount, overlapCount, underlyingImageEstimate });
        const children = buildGroupChildren({
            childGroupIds: group.childGroupIds,
            groupsById,
            descendantCountsByGroupId,
            assetsById,
        });

        rows.push({
            groupId: group.groupId,
            groupType: group.groupType,
            representativeAssetId: group.representativeAssetId,
            representativePreviewPath: buildRepresentativePreviewPath({
                representativeAssetId: group.representativeAssetId,
                assetsById,
            }),
            fileCount,
            descendantFileCount,
            directChildGroupCount: group.childGroupIds.length,
            overlapCount,
            underlyingImageEstimate,
            flags,
            summary: buildGroupSummary({
                fileCount,
                descendantFileCount,
                directChildGroupCount: group.childGroupIds.length,
                underlyingImageEstimate,
                overlapCount,
            }),
            assets,
            children,
        });
    }

    return rows.sort((left, right) => left.groupId.localeCompare(right.groupId));
}

export function buildGroupDiagnosticsReport(params: {
    assets: AssetRecord[];
    groups: GroupRecord[];
}): GroupDiagnosticsReport {
    const assetsById = new Map(params.assets.map((asset) => [asset.assetId, asset]));
    const groupsById = new Map(params.groups.map((group) => [group.groupId, group]));
    const groupTypesById = new Map(params.groups.map((group) => [group.groupId, group.groupType]));
    const groups = buildGroupRows({ assetsById, groupsById, groupTypesById });
    const overlappingAssetCount = params.assets.filter((asset) => asset.groupIds.length > 1).length;

    return {
        summary: {
            totalAssets: params.assets.length,
            totalGroups: params.groups.length,
            totalMemberships: params.assets.reduce((count, asset) => count + asset.groupIds.length, 0),
            overlappingAssetCount,
            suspiciousGroupCount: groups.filter((group) => group.flags.length > 0).length,
        },
        groups,
    };
}
