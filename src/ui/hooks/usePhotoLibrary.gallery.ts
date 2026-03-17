import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';
import { ASSET_PAGE_SIZE } from '@boundary/runtime/usePhotoLibrary.constants';

export type RefreshLibraryOptions = {
    galleryOrder?: 'default' | 'previewed_first';
    preservePagingState?: boolean;
    withGroupCounts?: boolean;
};

export function getCurrentFilter(filterStackRef: { current: LibraryFilter[] }) {
    const stack = filterStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

export function buildAssetRefreshPayload(
    groupSimilarPhotosRef: { current: boolean },
    filterStackRef: { current: LibraryFilter[] },
    options: RefreshLibraryOptions,
) {
    return {
        limit: ASSET_PAGE_SIZE,
        offset: 0,
        filter: getCurrentFilter(filterStackRef),
        detailLevel: 'gallery' as const,
        galleryOrder: options.galleryOrder ?? 'default',
        withGroupCounts: options.withGroupCounts ?? groupSimilarPhotosRef.current,
    };
}

export function buildLoadMoreAssetsPayload(params: {
    assetCount: number;
    filterStackRef: { current: LibraryFilter[] };
    groupSimilarPhotosRef: { current: boolean };
}) {
    return {
        limit: ASSET_PAGE_SIZE,
        offset: params.assetCount,
        filter: getCurrentFilter(params.filterStackRef),
        detailLevel: 'gallery' as const,
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
