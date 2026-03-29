import { useLayoutEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type { Asset } from '@contracts/core';
import { fitViewportStageDimensions } from './photoViewportImageState';

type StageSize = { width: number; height: number } | null;

function readViewportSize(element: HTMLDivElement): { width: number; height: number } {
    return {
        width: element.clientWidth,
        height: element.clientHeight,
    };
}

export function useViewportStageDimensions(
    containerRef: RefObject<HTMLDivElement | null>,
    asset: Asset,
): StageSize {
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const updateViewportSize = () => setViewportSize(readViewportSize(container));
        updateViewportSize();

        const observer = new ResizeObserver(() => {
            updateViewportSize();
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [containerRef]);

    return useMemo(() => {
        if (!asset.width || !asset.height) {
            return null;
        }

        const nextSize = fitViewportStageDimensions({
            viewportWidth: viewportSize.width,
            viewportHeight: viewportSize.height,
            assetWidth: asset.width,
            assetHeight: asset.height,
        });

        if (nextSize.width <= 0 || nextSize.height <= 0) {
            return null;
        }

        return nextSize;
    }, [asset.height, asset.width, viewportSize.height, viewportSize.width]);
}
