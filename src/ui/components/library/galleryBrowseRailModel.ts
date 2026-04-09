import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';

export const GALLERY_SCROLL_SETTLE_DELAY_MS = 120;

export function getDefaultGalleryLayoutMode(): GalleryLayoutMode {
    return 'justified';
}

export function getBrowseRowHeightBand(containerWidth: number) {
    if (containerWidth >= 1600) {return 208;}
    if (containerWidth >= 1200) {return 184;}
    if (containerWidth >= 800) {return 168;}
    return 150;
}

export function shouldPrefetchBufferedRows(remainingRows: number, viewportRowCount: number) {
    return remainingRows <= Math.max(3, viewportRowCount + 1);
}

export function getScrollSettledState(lastScrollAt: number, now: number, delayMs = GALLERY_SCROLL_SETTLE_DELAY_MS) {
    return now - lastScrollAt >= delayMs;
}
