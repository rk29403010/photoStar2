import type { Asset, TileIntent } from '@contracts/core';

export type GalleryLayoutMode = 'tiled' | 'grid';

export type GalleryTileLayout = {
    intent: TileIntent;
    spanW: number;
    spanH: number;
};

const TARGET_RATIOS: ReadonlyArray<{ ratio: number; spanW: number; spanH: number }> = [
    { ratio: 1, spanW: 3, spanH: 3 },
    { ratio: 4 / 3, spanW: 4, spanH: 3 },
    { ratio: 3 / 4, spanW: 3, spanH: 4 },
    { ratio: 3 / 2, spanW: 3, spanH: 2 },
    { ratio: 2 / 3, spanW: 2, spanH: 3 },
    { ratio: 16 / 9, spanW: 4, spanH: 2 },
] as const;

function getBestTargetRatio(width: number, height: number) {
    const ratio = width / height;
    let bestTarget: { ratio: number; spanW: number; spanH: number } = TARGET_RATIOS[0];
    let minDiff = Number.POSITIVE_INFINITY;

    for (const target of TARGET_RATIOS) {
        const diff = Math.abs(ratio - target.ratio);
        if (diff < minDiff) {
            minDiff = diff;
            bestTarget = target;
        }
    }

    return bestTarget;
}

export function buildGalleryTileLayout(asset: Pick<Asset, 'width' | 'height' | 'manualState' | 'processingPhase' | 'layoutCapabilities'>, mode: GalleryLayoutMode): GalleryTileLayout {
    if (mode === 'grid') {
        return {
            intent: 'normal',
            spanW: 3,
            spanH: 3,
        };
    }

    const height = asset.height || 1;
    const width = asset.width || 1;
    const bestTarget = getBestTargetRatio(width, height);
    let intent: TileIntent = 'normal';
    let { spanW, spanH } = bestTarget;
    const isHero = asset.manualState?.forceHero || (asset.processingPhase === 2 && asset.layoutCapabilities?.heroEligible);

    if (isHero) {
        intent = 'hero';
        spanW = Math.min(Math.round(spanW * 2), 24);
        spanH = Math.round(spanH * 2);
    }

    return {
        intent,
        spanW,
        spanH,
    };
}
