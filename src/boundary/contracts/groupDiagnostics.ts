export type GroupDiagnosticsFlag =
    | 'multi_group_overlap'
    | 'overcount_on_collapse';

export interface GroupDiagnosticsAssetRow {
    assetId: string;
    originalPath: string;
    previewPath: string | null;
    membershipCount: number;
    groupIds: string[];
    groups: GroupDiagnosticsMembershipGroupRow[];
}

export interface GroupDiagnosticsMembershipGroupRow {
    groupId: string;
    groupType: string;
    representativeAssetId: string | null;
    representativePreviewPath: string | null;
}

export interface GroupDiagnosticsChildRow {
    groupId: string;
    groupType: string;
    representativeAssetId: string | null;
    representativePreviewPath: string | null;
    descendantFileCount: number;
}

export interface GroupDiagnosticsGroupRow {
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

export interface GroupDiagnosticsSummary {
    totalAssets: number;
    totalGroups: number;
    totalMemberships: number;
    overlappingAssetCount: number;
    suspiciousGroupCount: number;
}

export interface GroupDiagnosticsReport {
    summary: GroupDiagnosticsSummary;
    groups: GroupDiagnosticsGroupRow[];
}
