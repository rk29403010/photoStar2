import type { GalleryTimelineSeek } from '../../boundary/contracts/core';
import type { AssetGalleryOrder } from './assetGalleryOrder';

type SqlValue = string | number;

export type AssetTimelineSeek = GalleryTimelineSeek | null;
export type AssetTimelineSeekClause = {
    sql: string;
    params: SqlValue[];
};

function hasTargetDate(seek: GalleryTimelineSeek | null): seek is Extract<GalleryTimelineSeek, { kind: 'dated' }> {
    return seek?.kind === 'dated' && typeof seek.targetDate === 'string' && seek.targetDate.length > 0;
}

export function getAssetTimelineSeek(payload: { gallerySeek?: GalleryTimelineSeek | null } | undefined): AssetTimelineSeek {
    if (!payload?.gallerySeek) {
        return null;
    }
    if (payload.gallerySeek.kind === 'unknown') {
        return { kind: 'unknown' };
    }
    if (hasTargetDate(payload.gallerySeek)) {
        return { kind: 'dated', targetDate: payload.gallerySeek.targetDate };
    }
    return null;
}

export function buildAssetTimelineSeekClause(alias: string, galleryOrder: AssetGalleryOrder, seek: AssetTimelineSeek): AssetTimelineSeekClause {
    if (!seek) {
        return { sql: '', params: [] };
    }
    if (seek.kind === 'unknown') {
        return {
            sql: `${alias}.photo_created_at IS NULL`,
            params: [],
        };
    }

    const comparator = galleryOrder === 'oldest_first' ? '>=' : '<=';
    return {
        sql: `${alias}.photo_created_at IS NOT NULL AND ${alias}.photo_created_at ${comparator} ?`,
        params: [seek.targetDate],
    };
}
