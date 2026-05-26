import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { Asset } from '@contracts/core';

export type FilterType = 'person_any' | 'person_all' | 'person_only' | 'album' | 'tag';

type LibraryFilterBase = {
    personIds: string[];
    description?: string;
    persons?: { id: string; name: string }[];
};

type PersonLibraryFilter = LibraryFilterBase & {
    type: 'person_any' | 'person_all' | 'person_only';
};

type AlbumLibraryFilter = LibraryFilterBase & {
    type: 'album';
    albumId: string;
};

type TagLibraryFilter = LibraryFilterBase & {
    type: 'tag';
    value: string;
};

export type LibraryFilter = PersonLibraryFilter | AlbumLibraryFilter | TagLibraryFilter;

export type NotificationItem = {
    id: string;
    type: 'warning' | 'info' | 'success' | 'error';
    title: string;
    message?: ReactNode;
    actionLabel?: string;
    actionKind?: 'open_workflow' | 'open_asset' | 'retry';
    actionPayload?: Record<string, unknown>;
};

export type FolderHistoryItem = {
    path: string;
    last_scanned_at: string;
};

export type UiFeedEntrySource = 'asset_response' | 'workflow_poll' | 'event';

export type UiFeedEntry = {
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
