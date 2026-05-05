import type { Asset } from './core';

export type TimelineGroupId = `decade-${number}` | 'unknown-date';

export type TimelineGroupSummary = {
    id: TimelineGroupId;
    label: string;
    sortKey: string;
    startDate: string | null;
    endDate: string | null;
    itemCount: number;
    isLoaded: boolean;
}

export type TimelineGroupRow = {
    kind: 'row';
    rowId: string;
    assets: Asset[];
}

export type TimelineGroupAssetItem = {
    kind: 'asset';
    asset: Asset;
    assetId: string;
}

export type TimelineGroupItem = TimelineGroupRow | TimelineGroupAssetItem;

export type TimelineGalleryPage = {
    groupId: TimelineGroupId;
    items: TimelineGroupItem[];
    nextCursor: string | null;
    isFullyLoaded: boolean;
}

export type TimelineJumpTarget = {
    groupId: TimelineGroupId;
    anchorAssetId?: string;
}
