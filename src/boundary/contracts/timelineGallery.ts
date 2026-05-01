import type { Asset } from './core';

export type TimelineGroupId = `decade-${number}` | 'unknown-date';

export interface TimelineGroupSummary {
    id: TimelineGroupId;
    label: string;
    sortKey: string;
    startDate: string | null;
    endDate: string | null;
    itemCount: number;
    isLoaded: boolean;
}

export interface TimelineGroupRow {
    kind: 'row';
    rowId: string;
    assets: Asset[];
}

export interface TimelineGroupAssetItem {
    kind: 'asset';
    asset: Asset;
    assetId: string;
}

export type TimelineGroupItem = TimelineGroupRow | TimelineGroupAssetItem;

export interface TimelineGalleryPage {
    groupId: TimelineGroupId;
    items: TimelineGroupItem[];
    nextCursor: string | null;
    isFullyLoaded: boolean;
}

export interface TimelineJumpTarget {
    groupId: TimelineGroupId;
    anchorAssetId?: string;
}
