import type { GalleryTimelineSeek } from '@contracts/core';
import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';

export type GalleryOrder = 'default' | 'oldest_first' | 'previewed_first';
export type { GalleryTimelineSeek } from '@contracts/core';

export type RefreshLibraryOptions = {
    galleryOrder?: GalleryOrder;
    gallerySeek?: GalleryTimelineSeek | null;
    preservePagingState?: boolean;
    withGroupCounts?: boolean;
    loadedAssetCount?: number;
};

export function getCurrentFilter(filterStackRef: { current: LibraryFilter[] }) {
    const stack = filterStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

export function buildAssetRefreshPayload(
    groupSimilarPhotosRef: { current: boolean },
    galleryOrderRef: { current: GalleryOrder },
    gallerySeekRef: { current: GalleryTimelineSeek | null },
    filterStackRef: { current: LibraryFilter[] },
    options: RefreshLibraryOptions,
) {
    const refreshLimit = options.preservePagingState
        ? Math.max(ASSET_PAGE_SIZE, options.loadedAssetCount ?? 0)
        : ASSET_PAGE_SIZE;

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
    galleryOrderRef: { current: GalleryOrder };
    gallerySeekRef: { current: GalleryTimelineSeek | null };
}) {
    return {
        limit: ASSET_PAGE_SIZE,
        offset: params.assetCount,
        filter: getCurrentFilter(params.filterStackRef),
        detailLevel: 'gallery' as const,
        galleryOrder: params.galleryOrderRef.current,
        gallerySeek: params.gallerySeekRef.current,
        withGroupCounts: params.groupSimilarPhotosRef.current,
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
