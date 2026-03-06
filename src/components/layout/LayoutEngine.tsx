import React from 'react';
import type { Asset, TileIntent } from '../../../shared/types/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { Tile } from './Tile';

interface LayoutEngineProps {
    assets: Asset[];
    debug?: boolean;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    librarySelection?: Set<string>;
    onLibrarySelectionChange?: (selection: Set<string>) => void;
    declusteredAssets?: Set<string>;
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

export const LayoutEngine: React.FC<LayoutEngineProps> = ({
    assets, debug = false, onAssetClick, selectedAssetId,
    activeFilter, showFaces, onUntagAsset, onSetSensitivity,
    librarySelection, onLibrarySelectionChange, declusteredAssets
}) => {
    const layoutItems = React.useMemo(() => computeLayout(assets), [assets]);

    // Multi-select state
    const [isSelecting, setIsSelecting] = React.useState(false);
    const [lastSelectedIdx, setLastSelectedIdx] = React.useState<number | null>(null);
    const pressTimer = React.useRef<number | null>(null);

    React.useEffect(() => {
        const handleMouseUp = () => setIsSelecting(false);
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

                if (onLibrarySelectionChange) {
                    e.preventDefault();
                    const allIds = new Set(layoutItems.map(item => item.asset.id));
                    onLibrarySelectionChange(allIds);
                }
            }
        };
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [layoutItems, onLibrarySelectionChange]);

    const toggleSelection = (id: string, index: number, shiftKey: boolean) => {
        if (!librarySelection || !onLibrarySelectionChange) return;
        const next = new Set(librarySelection);

        if (shiftKey && lastSelectedIdx !== null) {
            // Block select
            const start = Math.min(lastSelectedIdx, index);
            const end = Math.max(lastSelectedIdx, index);
            const isAdding = !next.has(id);
            for (let i = start; i <= end; i++) {
                if (isAdding) next.add(layoutItems[i].asset.id);
                else next.delete(layoutItems[i].asset.id);
            }
        } else {
            if (next.has(id)) next.delete(id);
            else next.add(id);
        }

        setLastSelectedIdx(index);
        onLibrarySelectionChange(next);
    };

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
            {layoutItems.map((item, i) => {
                const isSelected = librarySelection?.has(item.asset.id) || selectedAssetId === item.asset.id;
                const isDeclustered = declusteredAssets?.has(item.asset.id);

                return (
                    <div
                        key={item.asset.id || i}
                        style={{
                            gridColumn: `span ${item.spanW}`,
                            gridRow: `span ${item.spanH}`,
                            opacity: isDeclustered ? 0.4 : 1,
                            filter: isDeclustered ? 'grayscale(80%)' : 'none',
                            position: 'relative',
                            userSelect: 'none',
                            transform: isSelected ? 'scale(0.95)' : 'none',
                            transition: 'transform 0.2s',
                            boxShadow: isSelected ? '0 0 0 3px #3b82f6' : 'none',
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}
                        onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            if (librarySelection && librarySelection.size > 0) {
                                setIsSelecting(true);
                                toggleSelection(item.asset.id, i, e.shiftKey);
                            } else {
                                pressTimer.current = window.setTimeout(() => {
                                    if (onLibrarySelectionChange) {
                                        setIsSelecting(true);
                                        const next = new Set([item.asset.id]);
                                        setLastSelectedIdx(i);
                                        onLibrarySelectionChange(next);
                                    }
                                }, 500); // 500ms long press to activate
                            }
                        }}
                        onPointerUp={() => {
                            if (pressTimer.current) {
                                clearTimeout(pressTimer.current);
                                pressTimer.current = null;
                            }
                        }}
                        onPointerLeave={() => {
                            if (pressTimer.current) {
                                clearTimeout(pressTimer.current);
                                pressTimer.current = null;
                            }
                        }}
                        onPointerEnter={() => {
                            if (isSelecting && librarySelection && onLibrarySelectionChange) {
                                // Drag-select adds to selection naturally
                                const next = new Set(librarySelection);
                                next.add(item.asset.id);
                                onLibrarySelectionChange(next);
                                setLastSelectedIdx(i);
                            }
                        }}
                        onClick={() => {
                            if (pressTimer.current) {
                                clearTimeout(pressTimer.current);
                                pressTimer.current = null;
                            }
                            if (librarySelection && librarySelection.size > 0) {
                                // Already handled partially by pointerDown, but pointerDown + up means click
                                // Actually, pointerDown already toggled it if size > 0.
                                // But if pointerDown dragged, it adds. If click, we prevent normal view.
                            } else {
                                onAssetClick?.(item.asset.id);
                            }
                        }}
                    >
                        {/* Semi-transparent overlay for multi-select visual aid */}
                        {isSelected && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(59, 130, 246, 0.2)', zIndex: 5, pointerEvents: 'none' }} />
                        )}
                        <Tile
                            asset={item.asset}
                            intent={item.intent}
                            debug={debug}
                            selected={isSelected}
                            activeFilter={activeFilter}
                            showFaces={showFaces}
                            onUntagAsset={onUntagAsset}
                            onSetSensitivity={onSetSensitivity}
                        />
                    </div>
                );
            })}
        </div>
    );
};
