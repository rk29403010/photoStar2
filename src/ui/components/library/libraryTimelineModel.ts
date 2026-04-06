import type { Asset, GalleryTimelineSeek, LibraryTimelineBucket, LibraryTimelineSummary } from '@contracts/core';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';

function isDateWithinBucket(timestamp: string, bucket: LibraryTimelineBucket) {
    return timestamp >= bucket.startDate && timestamp <= bucket.endDate;
}

export function isTimelineSortMode(sortMode: LibrarySortMode): sortMode is 'date' | 'reverse-date' {
    return sortMode === 'date' || sortMode === 'reverse-date';
}

export function getTimelineSeekForBucket(bucket: LibraryTimelineBucket, sortMode: 'date' | 'reverse-date'): GalleryTimelineSeek {
    return {
        kind: 'dated',
        targetDate: sortMode === 'reverse-date' ? bucket.startDate : bucket.endDate,
    };
}

export function findTimelineBucketIndex(buckets: LibraryTimelineBucket[], seek: GalleryTimelineSeek | null) {
    if (!seek || seek.kind !== 'dated') {
        return -1;
    }
    return buckets.findIndex((bucket) => (
        seek.targetDate === bucket.startDate
        || seek.targetDate === bucket.endDate
        || isDateWithinBucket(seek.targetDate, bucket)
    ));
}

function getLeadingDatedAsset(assets: Asset[]) {
    return assets.find((asset) => typeof asset.photo_created_at === 'string' && asset.photo_created_at.length > 0) ?? null;
}

export function getActiveTimelineSeek(params: {
    assets: Asset[];
    sortMode: LibrarySortMode;
    timeline: LibraryTimelineSummary | null | undefined;
    galleryTimelineSeek: GalleryTimelineSeek | null;
}) {
    if (params.galleryTimelineSeek) {
        return params.galleryTimelineSeek;
    }
    if (!params.timeline || !isTimelineSortMode(params.sortMode)) {
        return null;
    }

    const datedAsset = getLeadingDatedAsset(params.assets);
    if (!datedAsset?.photo_created_at) {
        return null;
    }

    const bucket = params.timeline.buckets.find((entry) => isDateWithinBucket(datedAsset.photo_created_at ?? '', entry));
    return bucket ? getTimelineSeekForBucket(bucket, params.sortMode) : null;
}

export function getTimelineBoundaryLabel(timestamp: string | null) {
    if (!timestamp) {
        return 'Unknown';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return timestamp.slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-GB', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}

function getAssetTimelineTimestamp(asset: Asset) {
    return typeof asset.photo_created_at === 'string' && asset.photo_created_at.length > 0 ? asset.photo_created_at : null;
}

export function getTimelineBucketIndexForAsset(timeline: LibraryTimelineSummary | null | undefined, asset: Asset) {
    const timestamp = getAssetTimelineTimestamp(asset);
    if (!timeline || !timestamp) {
        return -1;
    }
    return timeline.buckets.findIndex((bucket) => isDateWithinBucket(timestamp, bucket));
}

export function createSelectionKeyTimelineBucketIndex(items: LibrarySelectableItem[], timeline: LibraryTimelineSummary | null | undefined) {
    const selectionKeyToBucketIndex = new Map<string, number>();
    for (const item of items) {
        const bucketIndex = getTimelineBucketIndexForAsset(timeline, item.asset);
        if (bucketIndex >= 0) {
            selectionKeyToBucketIndex.set(item.selectionKey, bucketIndex);
        }
    }
    return selectionKeyToBucketIndex;
}
