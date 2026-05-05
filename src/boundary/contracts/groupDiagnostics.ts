export type GroupDiagnosticsFlag =
    | 'multi_group_overlap'
    | 'overcount_on_collapse';

export type GroupDiagnosticsAssetRow = {
    assetId: string;
    originalPath: string;
    previewPath: string | null;
    membershipCount: number;
    groupIds: string[];
    groups: GroupDiagnosticsMembershipGroupRow[];
}

export type GroupDiagnosticsMembershipGroupRow = {
    groupId: string;
    groupType: string;
    representativeAssetId: string | null;
    representativePreviewPath: string | null;
}

export type GroupDiagnosticsChildRow = {
    groupId: string;
    groupType: string;
    representativeAssetId: string | null;
    representativePreviewPath: string | null;
    descendantFileCount: number;
}

export type GroupDiagnosticsGroupRow = {
    groupId: string;
    groupType: string;
    representativeAssetId: string | null;
    representativePreviewPath: string | null;
    fileCount: number;
    descendantFileCount: number;
    directChildGroupCount: number;
    overlapCount: number;
    underlyingImageEstimate: number;
    flags: GroupDiagnosticsFlag[];
    summary: string;
    assets: GroupDiagnosticsAssetRow[];
    children: GroupDiagnosticsChildRow[];
}

export type GroupDiagnosticsSummary = {
    totalAssets: number;
    totalGroups: number;
    totalMemberships: number;
    overlappingAssetCount: number;
    suspiciousGroupCount: number;
}

export type GroupDiagnosticsReport = {
    summary: GroupDiagnosticsSummary;
    groups: GroupDiagnosticsGroupRow[];
}
