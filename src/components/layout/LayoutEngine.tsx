import React, { useMemo } from 'react';
import type { Asset, TileIntent } from '../../types/core';
import { Tile } from './Tile';

interface LayoutEngineProps {
    assets: Asset[];
    debug?: boolean;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
}

const computeLayout = (assets: Asset[]): { asset: Asset; intent: TileIntent; spanW: number; spanH: number; styles?: React.CSSProperties }[] => {
    return assets.map((asset) => {
        let intent: TileIntent = 'normal';

        // Phase 0: Geometry-First (Ratio = Width / Height)
        // We use exact normalized buckets to match the backend thumbnail generator.
        const h = asset.height || 1;
        const w = asset.width || 1;
        const ratio = w / h; // Note: Use W/H to explicitly align with previews.ts originalRatio

        // Target ratios match previews.ts to prevent cropped thumbnail skew
        const targetRatios = [
            { ratio: 1, spanW: 3, spanH: 3 },       // 1:1 Square
            { ratio: 4 / 3, spanW: 4, spanH: 3 },   // 4:3 Landscape
            { ratio: 3 / 4, spanW: 3, spanH: 4 },   // 3:4 Portrait
            { ratio: 3 / 2, spanW: 3, spanH: 2 },   // 3:2 Landscape
            { ratio: 2 / 3, spanW: 2, spanH: 3 },   // 2:3 Portrait
            { ratio: 16 / 9, spanW: 4, spanH: 2 }   // 16:9 Panorama (~2:1 grid size)
        ];

        let bestTarget = targetRatios[0];
        let minDiff = Infinity;

        for (const target of targetRatios) {
            const diff = Math.abs(ratio - target.ratio);
            if (diff < minDiff) {
                minDiff = diff;
                bestTarget = target;
            }
        }

        let { spanW, spanH } = bestTarget;

        // Apply Manual overrides/Debug overrides
        // Also supports future Phase 2 automated Hero eligibility
        const isHero = asset.manualState?.forceHero || (asset.processingPhase === 2 && asset.layoutCapabilities?.heroEligible);

        if (isHero) {
            intent = 'hero';
            // Hero behaviour: Scale up by ~1.5x to 2x (keeping approx ratio)
            spanW = Math.min(Math.round(spanW * 2), 24);
            spanH = Math.round(spanH * 2);
        } else if (asset.manualState?.forceDocument) {
            // Processing Phase 1: Document Calming
        }

        return { asset, intent, spanW, spanH };
    });
};

export const LayoutEngine: React.FC<LayoutEngineProps> = ({ assets, debug = false, onAssetClick, selectedAssetId }) => {
    const layoutItems = useMemo(() => computeLayout(assets), [assets]);

    return (
        <div
            className="layout-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(24, 1fr)',
                gridAutoFlow: 'dense', // Fill holes in the grid layout!
                gridAutoRows: 'min(75px, 4.1vw)', // Gives approx square grid cells based on 100vw/24
                gap: '2px', // Tiny gap
                padding: '2px',
                width: '100%',
                maxWidth: '1800px', // Reasonable max width for massive screens
                margin: '0 auto',
            }}
        >
            {layoutItems.map((item, i) => (
                <div
                    key={item.asset.id || i}
                    style={{
                        gridColumn: `span ${item.spanW}`,
                        gridRow: `span ${item.spanH}`
                    }}
                    onClick={() => onAssetClick?.(item.asset.id)}
                >
                    <Tile
                        asset={item.asset}
                        intent={item.intent}
                        debug={debug}
                        selected={selectedAssetId === item.asset.id}
                    />
                </div>
            ))}
        </div>
    );
};
