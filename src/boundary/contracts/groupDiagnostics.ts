export type GroupDiagnosticsFlag =
    | 'multi_group_overlap'
    | 'overcount_on_collapse';

export interface GroupDiagnosticsAssetRow {
    assetId: string;
    originalPath: string;
    previewPath: string | null;
    membershipCount: number;
    groupIds: string[];
}

export interface GroupDiagnosticsGroupRow {
    groupId: string;
    groupType: string;
    fileCount: number;
    overlapCount: number;
    underlyingImageEstimate: number;
    flags: GroupDiagnosticsFlag[];
    summary: string;
    assets: GroupDiagnosticsAssetRow[];
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
