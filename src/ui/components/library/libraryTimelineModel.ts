import type { Asset, GalleryTimelineSeek, LibraryStats, LibraryTimelineBucket, LibraryTimelineSummary } from '@contracts/core';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';

function isDateWithinBucket(timestamp: string, bucket: LibraryTimelineBucket) {
    return timestamp >= bucket.startDate && timestamp <= bucket.endDate;
}

export function isTimelineSortMode(sortMode: LibrarySortMode): sortMode is 'date' | 'reverse-date' {
    return sortMode === 'date' || sortMode === 'reverse-date';
}

export function getTimelineSummaryForGalleryMode(stats: LibraryStats | null | undefined, groupSimilarPhotos: boolean) {
    if (!stats) {
        return null;
    }
    if (groupSimilarPhotos) {
        return stats.groupedTimeline ?? stats.timeline ?? null;
    }
    return stats.ungroupedTimeline ?? stats.timeline ?? null;
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

function getDecadeStart(timestamp: string) {
    const year = new Date(timestamp).getUTCFullYear();
    if (Number.isNaN(year)) {
        return null;
    }
    return Math.floor(year / 10) * 10;
}

function createTimelineBucket(decadeStart: number, count: number): LibraryTimelineBucket {
    const endYear = decadeStart + 9;
    return {
        label: `${decadeStart}s`,
        startYear: decadeStart,
        endYear,
        startDate: new Date(Date.UTC(decadeStart, 0, 1, 0, 0, 0, 0)).toISOString(),
        endDate: new Date(Date.UTC(endYear, 11, 31, 23, 59, 59, 999)).toISOString(),
        count,
    };
}

function updateTimelineBounds(params: {
    timestamp: string;
    firstPhotoDate: string | null;
    lastPhotoDate: string | null;
}) {
    return {
        firstPhotoDate: !params.firstPhotoDate || params.timestamp < params.firstPhotoDate ? params.timestamp : params.firstPhotoDate,
        lastPhotoDate: !params.lastPhotoDate || params.timestamp > params.lastPhotoDate ? params.timestamp : params.lastPhotoDate,
    };
}

function appendTimelineBucket(buckets: LibraryTimelineBucket[], decadeStart: number) {
    const currentBucket = buckets.at(-1);
    if (currentBucket && currentBucket.startYear === decadeStart) {
        currentBucket.count += 1;
        return;
    }

    buckets.push(createTimelineBucket(decadeStart, 1));
}

function getVisibleTimelineItemState(item: LibrarySelectableItem) {
    const timestamp = getAssetTimelineTimestamp(item.asset);
    if (!timestamp) {
        return { kind: 'unknown' } as const;
    }

    const decadeStart = getDecadeStart(timestamp);
    if (decadeStart == null) {
        return { kind: 'unknown' } as const;
    }

    return {
        kind: 'dated',
        timestamp,
        decadeStart,
    } as const;
}

export function buildVisibleTimelineSummary(items: LibrarySelectableItem[]): LibraryTimelineSummary | null {
    if (items.length === 0) {
        return null;
    }

    const buckets: LibraryTimelineBucket[] = [];
    let unknownDateCount = 0;
    let firstPhotoDate: string | null = null;
    let lastPhotoDate: string | null = null;

    for (const item of items) {
        const itemState = getVisibleTimelineItemState(item);
        if (itemState.kind === 'unknown') {
            unknownDateCount += 1;
            continue;
        }

        ({ firstPhotoDate, lastPhotoDate } = updateTimelineBounds({
            timestamp: itemState.timestamp,
            firstPhotoDate,
            lastPhotoDate,
        }));
        appendTimelineBucket(buckets, itemState.decadeStart);
    }

    if (buckets.length === 0 && unknownDateCount === 0) {
        return null;
    }

    return {
        firstPhotoDate,
        lastPhotoDate,
        datedPhotoCount: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
        unknownDateCount,
        buckets,
    };
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
