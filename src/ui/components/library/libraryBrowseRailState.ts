import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    GALLERY_SCROLL_SETTLE_DELAY_MS,
    getBrowseRowHeightBand,
    getScrollSettledState,
} from './galleryBrowseRailModel';

function useViewportWidth() {
    const [viewportWidth, setViewportWidth] = useState(() => (typeof globalThis.window === 'undefined' ? 1280 : window.innerWidth));

    useEffect(() => {
        if (typeof globalThis.window === 'undefined') {
            return;
        }

        const handleResize = () => {
            setViewportWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return viewportWidth;
}

export function useGalleryBrowseRailState() {
    const viewportWidth = useViewportWidth();
    const browseRowHeight = useMemo(() => getBrowseRowHeightBand(viewportWidth), [viewportWidth]);
    const [isScrollSettled, setIsScrollSettled] = useState(true);
    const settleTimeoutRef = useRef<number | null>(null);
    const lastScrollAtRef = useRef(0);

    const clearSettleTimeout = useCallback(() => {
        if (settleTimeoutRef.current == null) {return;}
        globalThis.clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
    }, []);

    const markScrollActivity = useCallback(() => {
        lastScrollAtRef.current = Date.now();
        setIsScrollSettled(false);
        clearSettleTimeout();
        settleTimeoutRef.current = globalThis.setTimeout(() => {
            setIsScrollSettled(getScrollSettledState(lastScrollAtRef.current, Date.now(), GALLERY_SCROLL_SETTLE_DELAY_MS));
            settleTimeoutRef.current = null;
        }, GALLERY_SCROLL_SETTLE_DELAY_MS);
    }, [clearSettleTimeout]);

    useEffect(() => {
        return () => clearSettleTimeout();
    }, [clearSettleTimeout]);

    return { browseRowHeight, isScrollSettled, markScrollActivity };
}
