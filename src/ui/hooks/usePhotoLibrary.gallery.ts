import type { GalleryTimelineSeek } from '@contracts/core';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';
import type { LibraryGalleryDataMode } from '@shared/utils/libraryGallery';

export type GalleryOrder = 'default' | 'oldest_first' | 'previewed_first';
export type { GalleryTimelineSeek } from '@contracts/core';

export const GROUPED_TIMELINE_ASSET_LIMIT = 5_000;

export type RefreshLibraryOptions = {
    galleryOrder?: GalleryOrder;
    gallerySeek?: GalleryTimelineSeek | null;
    preservePagingState?: boolean;
    withGroupCounts?: boolean;
    loadedAssetCount?: number;
};

type TimelinePayloadParams = {
    filter: LibraryFilter | undefined;
    galleryOrder: GalleryOrder;
};

export function getCurrentFilter(filterStackRef: { current: LibraryFilter[] }) {
    const stack = filterStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

export function buildAssetRefreshPayload(
    groupSimilarPhotosRef: { current: boolean },
    galleryDataModeRef: { current: LibraryGalleryDataMode },
    galleryOrderRef: { current: GalleryOrder },
    gallerySeekRef: { current: GalleryTimelineSeek | null },
    filterStackRef: { current: LibraryFilter[] },
    options: RefreshLibraryOptions,
) {
    const prefersFullTimelineDataset = galleryDataModeRef.current === 'grouped-timeline';
    let refreshLimit = ASSET_PAGE_SIZE;
    if (prefersFullTimelineDataset) {
        refreshLimit = GROUPED_TIMELINE_ASSET_LIMIT;
    } else if (options.preservePagingState) {
        refreshLimit = Math.max(ASSET_PAGE_SIZE, options.loadedAssetCount ?? 0);
    }

    return {
        limit: refreshLimit,
        offset: 0,
        filter: getCurrentFilter(filterStackRef),
        detailLevel: 'gallery' as const,
        galleryOrder: options.galleryOrder ?? galleryOrderRef.current,
        gallerySeek: options.gallerySeek ?? gallerySeekRef.current,
        withGroupCounts: options.withGroupCounts ?? groupSimilarPhotosRef.current,
    };
}

export function buildLoadMoreAssetsPayload(params: {
    assetCount: number;
    filterStackRef: { current: LibraryFilter[] };
    groupSimilarPhotosRef: { current: boolean };
    galleryDataModeRef: { current: LibraryGalleryDataMode };
    galleryOrderRef: { current: GalleryOrder };
    gallerySeekRef: { current: GalleryTimelineSeek | null };
}) {
    const loadMoreLimit = params.galleryDataModeRef.current === 'grouped-timeline'
        ? GROUPED_TIMELINE_ASSET_LIMIT
        : ASSET_PAGE_SIZE;
    return {
        limit: loadMoreLimit,
        offset: params.assetCount,
        filter: getCurrentFilter(params.filterStackRef),
        detailLevel: 'gallery' as const,
        galleryOrder: params.galleryOrderRef.current,
        gallerySeek: params.gallerySeekRef.current,
        withGroupCounts: params.groupSimilarPhotosRef.current,
    };
}

export function buildTimelineGroupsPayload(params: TimelinePayloadParams) {
    return {
        filter: params.filter,
        detailLevel: 'gallery' as const,
        galleryOrder: params.galleryOrder,
        groupBy: 'decade' as const,
    };
}

export function buildTimelineGroupPagePayload(params: TimelinePayloadParams & {
    groupId: string;
    cursor?: string | null;
    limit?: number;
}) {
    return {
        filter: params.filter,
        detailLevel: 'gallery' as const,
        galleryOrder: params.galleryOrder,
        groupId: params.groupId,
        cursor: params.cursor ?? null,
        limit: params.limit ?? ASSET_PAGE_SIZE,
    };
}

export function buildTimelineJumpTargetPayload(params: TimelinePayloadParams & {
    groupId: string;
}) {
    return {
        filter: params.filter,
        detailLevel: 'gallery' as const,
        galleryOrder: params.galleryOrder,
        groupId: params.groupId,
    };
}

export function requestBackgroundAssetRefresh<RequestFn>(
    request: (args: {
        idPrefix: string;
        command: string;
        payload: ReturnType<typeof buildAssetRefreshPayload>;
        timeoutMs: number;
        select: () => undefined;
    }) => Promise<RequestFn>,
    payload: ReturnType<typeof buildAssetRefreshPayload>,
) {
    void request({
        idPrefix: 'get_assets-preserve',
        command: 'get_assets',
        payload,
        timeoutMs: 10000,
        select: () => undefined,
    });
}
