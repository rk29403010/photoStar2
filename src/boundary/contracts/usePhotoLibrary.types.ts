import type { Dispatch, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';

export type FilterType = 'person_any' | 'person_all' | 'person_only' | 'album' | 'tag';

export interface LibraryFilter {
    type: FilterType;
    personIds: string[];
    albumId?: string;
    tag?: string;
    description?: string;
    persons?: { id: string; name: string }[];
}

export type NotificationItem = {
    id: string;
    type: 'warning' | 'info';
    message: string;
};

export type FolderHistoryItem = {
    path: string;
    last_scanned_at: string;
};

export type UiFeedEntrySource = 'asset_response' | 'workflow_poll' | 'event';

export interface UiFeedEntry {
    id: string;
    timestamp: string;
    source: UiFeedEntrySource;
    label: string;
    detail: string;
    requestId?: string;
    assetCount?: number;
    previewCount?: number;
    previousAssetCount?: number;
    nextAssetCount?: number;
    applied?: boolean;
}

export type UpdateAssetState = Dispatch<SetStateAction<Asset[]>>;
