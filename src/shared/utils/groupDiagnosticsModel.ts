import type {
    GroupDiagnosticsAssetRow,
    GroupDiagnosticsFlag,
    GroupDiagnosticsGroupRow,
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
    assetIds: string[];
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
}): GroupDiagnosticsAssetRow[] {
    const { assetIds, assetsById } = params;
    return assetIds.flatMap((assetId) => {
        const asset = assetsById.get(assetId);
        if (!asset) {return [];}
        return [{
            assetId,
            originalPath: asset.originalPath,
            previewPath: asset.previewPath,
            membershipCount: asset.groupIds.length,
            groupIds: asset.groupIds,
        }];
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
    fileCount: number;
    overlapCount: number;
    underlyingImageEstimate: number;
}): GroupDiagnosticsFlag[] {
    const { fileCount, overlapCount, underlyingImageEstimate } = params;
    const flags: GroupDiagnosticsFlag[] = [];

    if (overlapCount > 0) {
        flags.push('multi_group_overlap');
    }
    if (underlyingImageEstimate < fileCount) {
        flags.push('overcount_on_collapse');
    }

    return flags;
}

function buildGroupSummary(params: {
    fileCount: number;
    underlyingImageEstimate: number;
    overlapCount: number;
}) {
    const { fileCount, underlyingImageEstimate, overlapCount } = params;
    return `${fileCount} files, ${underlyingImageEstimate} underlying image${underlyingImageEstimate === 1 ? '' : 's'}, ${overlapCount} overlapping member${overlapCount === 1 ? '' : 's'}`;
}

function buildGroupRows(params: {
    assetsById: Map<string, AssetRecord>;
    groupsById: Map<string, GroupRecord>;
    groupTypesById: Map<string, string>;
}): GroupDiagnosticsGroupRow[] {
    const { assetsById, groupsById, groupTypesById } = params;
    const rows: GroupDiagnosticsGroupRow[] = [];

    for (const group of groupsById.values()) {
        const assets = buildGroupAssetRows({ assetIds: group.assetIds, assetsById });
        const overlapCount = assets.filter((asset) => asset.membershipCount > 1).length;
        const underlyingKeys = buildUnderlyingKeys({
            groupType: group.groupType,
            assetRows: assets,
            groupTypesById,
        });
        const underlyingImageEstimate = new Set(underlyingKeys).size;
        const fileCount = assets.length;
        const flags = buildGroupFlags({ fileCount, overlapCount, underlyingImageEstimate });

        rows.push({
            groupId: group.groupId,
            groupType: group.groupType,
            fileCount,
            overlapCount,
            underlyingImageEstimate,
            flags,
            summary: buildGroupSummary({ fileCount, underlyingImageEstimate, overlapCount }),
            assets,
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
