import type { Dispatch, SetStateAction } from 'react';
import type { Asset } from '../../shared/types/core';

export type FilterType = 'person_any' | 'person_all' | 'person_only' | 'album';

export interface LibraryFilter {
    type: FilterType;
    personIds: string[];
    albumId?: string;
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

export type UpdateAssetState = Dispatch<SetStateAction<Asset[]>>;
