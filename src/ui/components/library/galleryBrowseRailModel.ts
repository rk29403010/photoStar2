import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';

export const GALLERY_SCROLL_SETTLE_DELAY_MS = 320;
export const GALLERY_EAGER_PREVIEW_COUNT = 12;
export const GALLERY_ROW_GAP_PX = 12;
export const GALLERY_TILE_GAP_PX = 6;
export const GALLERY_MIN_PREFETCH_ROWS = 2;
export const GALLERY_MAX_PREFETCH_ROWS = 12;

export type GalleryScrollDirection = 'up' | 'down' | 'idle';

export function getDefaultGalleryLayoutMode(): GalleryLayoutMode {
    return 'justified';
}

export function getBrowseRowHeightBand(containerWidth: number) {
    if (containerWidth >= 1600) {return 244;}
    if (containerWidth >= 1200) {return 220;}
    if (containerWidth >= 800) {return 196;}
    return 176;
}

export function getPredictivePrefetchRows(params: {
    viewportRowCount: number;
    scrollDirection: GalleryScrollDirection;
    pixelsPerMs: number;
    rowHeight: number;
    averageBatchLoadMs: number;
}) {
    const viewportLeadRows = Math.max(GALLERY_MIN_PREFETCH_ROWS, Math.ceil(params.viewportRowCount / 2));
    if (params.scrollDirection !== 'down') {
        return viewportLeadRows;
    }

    const safeRowHeight = Math.max(1, params.rowHeight);
    const rowsPerMs = Math.abs(params.pixelsPerMs) / safeRowHeight;
    const responseWindowMs = Math.min(1_200, Math.max(180, params.averageBatchLoadMs));
    const dynamicLeadRows = Math.ceil(rowsPerMs * responseWindowMs) + 1;
    return Math.min(GALLERY_MAX_PREFETCH_ROWS, Math.max(viewportLeadRows, dynamicLeadRows));
}

export function shouldPrefetchBufferedRows(params: {
    remainingRows: number;
    viewportRowCount: number;
    scrollDirection: GalleryScrollDirection;
    pixelsPerMs: number;
    rowHeight: number;
    averageBatchLoadMs: number;
}) {
    return params.remainingRows <= getPredictivePrefetchRows(params);
}

export function getKeyboardScrollDelta(params: {
    key: string;
    browseRowHeight: number;
    viewportHeight: number;
    rowGap?: number;
}) {
    const rowStep = Math.max(1, params.browseRowHeight + (params.rowGap ?? GALLERY_ROW_GAP_PX));
    const pageStep = Math.max(rowStep, Math.round(params.viewportHeight * 0.88));

    if (params.key === 'ArrowDown') {return rowStep;}
    if (params.key === 'ArrowUp') {return -rowStep;}
    if (params.key === 'PageDown') {return pageStep;}
    if (params.key === 'PageUp') {return -pageStep;}
    return 0;
}

export function getScrollSettledState(lastScrollAt: number, now: number, delayMs = GALLERY_SCROLL_SETTLE_DELAY_MS) {
    return now - lastScrollAt >= delayMs;
}
