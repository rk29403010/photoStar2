import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent } from 'react';
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

type LayoutItem = { asset: Asset; intent: TileIntent; spanW: number; spanH: number };

interface SelectionState {
    isSelecting: boolean;
    setIsSelecting: (value: boolean) => void;
    lastSelectedIdx: number | null;
    setLastSelectedIdx: (value: number | null) => void;
    pressTimer: MutableRefObject<number | null>;
    toggleSelection: (id: string, index: number, shiftKey: boolean) => void;
}

interface LayoutTileProps {
    item: LayoutItem;
    index: number;
    debug: boolean;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onAssetClick?: (id: string) => void;
    librarySelection?: Set<string>;
    onLibrarySelectionChange?: (selection: Set<string>) => void;
    declusteredAssets?: Set<string>;
    selection: SelectionState;
    prioritizeImage: boolean;
}

const PRIORITY_TILE_COUNT = 60;

const computeLayout = (assets: Asset[]): LayoutItem[] => assets.map((asset) => {
    const h = asset.height || 1;
    const w = asset.width || 1;
    const ratio = w / h;
    const targetRatios = [
        { ratio: 1, spanW: 3, spanH: 3 }, { ratio: 4 / 3, spanW: 4, spanH: 3 }, { ratio: 3 / 4, spanW: 3, spanH: 4 },
        { ratio: 3 / 2, spanW: 3, spanH: 2 }, { ratio: 2 / 3, spanW: 2, spanH: 3 }, { ratio: 16 / 9, spanW: 4, spanH: 2 }
    ];

    let bestTarget = targetRatios[0];
    let minDiff = Infinity;
    for (const target of targetRatios) {
        const diff = Math.abs(ratio - target.ratio);
        if (diff < minDiff) { minDiff = diff; bestTarget = target; }
    }

    let { spanW, spanH } = bestTarget;
    let intent: TileIntent = 'normal';
    const isHero = asset.manualState?.forceHero || (asset.processingPhase === 2 && asset.layoutCapabilities?.heroEligible);
    if (isHero) {
        intent = 'hero';
        spanW = Math.min(Math.round(spanW * 2), 24);
        spanH = Math.round(spanH * 2);
    }
    return { asset, intent, spanW, spanH };
});

function useSelectionInteractions(
    layoutItems: LayoutItem[],
    librarySelection?: Set<string>,
    onLibrarySelectionChange?: (selection: Set<string>) => void
) {
    const [isSelecting, setIsSelecting] = useState(false);
    const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
    const pressTimer = useRef<number | null>(null);

    useSelectAllShortcut(layoutItems, onLibrarySelectionChange, setIsSelecting);

    const toggleSelection = useCallback((id: string, index: number, shiftKey: boolean) => {
        const next = getNextSelection({
            id,
            index,
            shiftKey,
            lastSelectedIdx,
            layoutItems,
            librarySelection,
        });
        if (!next || !onLibrarySelectionChange) {return;}
        setLastSelectedIdx(index);
        onLibrarySelectionChange(next);
    }, [lastSelectedIdx, layoutItems, librarySelection, onLibrarySelectionChange]);

    return { isSelecting, setIsSelecting, lastSelectedIdx, setLastSelectedIdx, pressTimer, toggleSelection };
}

function useSelectAllShortcut(
    layoutItems: LayoutItem[],
    onLibrarySelectionChange: ((selection: Set<string>) => void) | undefined,
    setIsSelecting: (value: boolean) => void
) {
    useEffect(() => {
        const handleMouseUp = () => setIsSelecting(false);
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key !== 'a') {return;}
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {return;}
            if (!onLibrarySelectionChange) {return;}
            e.preventDefault();
            onLibrarySelectionChange(new Set(layoutItems.map((item) => item.asset.id)));
        };

        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [layoutItems, onLibrarySelectionChange, setIsSelecting]);
}

function getNextSelection(params: {
    id: string;
    index: number;
    shiftKey: boolean;
    lastSelectedIdx: number | null;
    layoutItems: LayoutItem[];
    librarySelection?: Set<string>;
}) {
    const { id, index, shiftKey, lastSelectedIdx, layoutItems, librarySelection } = params;
    if (!librarySelection) {return null;}

    const next = new Set(librarySelection);
    if (shiftKey && lastSelectedIdx !== null) {
        applyRangeSelection(next, layoutItems, lastSelectedIdx, index, !next.has(id));
        return next;
    }

    if (next.has(id)) {next.delete(id);}
    else {next.add(id);}
    return next;
}

function applyRangeSelection(
    selection: Set<string>,
    layoutItems: LayoutItem[],
    startIndex: number,
    endIndex: number,
    isAdding: boolean
) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    for (let i = start; i <= end; i++) {
        if (isAdding) {selection.add(layoutItems[i].asset.id);}
        else {selection.delete(layoutItems[i].asset.id);}
    }
}

function clearPressTimer(pressTimer: MutableRefObject<number | null>) {
    if (!pressTimer.current) {return;}
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
}

function getTileShellStyle(isDeclustered: boolean | undefined, isSelected: boolean) {
    return {
        gridColumn: 'span 1',
        gridRow: 'span 1',
        opacity: isDeclustered ? 0.4 : 1,
        filter: isDeclustered ? 'grayscale(80%)' : 'none',
        position: 'relative' as const,
        userSelect: 'none' as const,
        transform: isSelected ? 'scale(0.95)' : 'none',
        transition: 'transform 0.2s',
        boxShadow: isSelected ? '0 0 0 3px #3b82f6' : 'none',
        borderRadius: '4px',
        overflow: 'hidden',
    };
}

function beginSelection(
    e: PointerEvent<HTMLDivElement>,
    item: LayoutItem,
    index: number,
    librarySelection: Set<string> | undefined,
    onLibrarySelectionChange: ((selection: Set<string>) => void) | undefined,
    selection: SelectionState
) {
    if (e.button !== 0) {return;}
    if (librarySelection && librarySelection.size > 0) {
        selection.setIsSelecting(true);
        selection.toggleSelection(item.asset.id, index, e.shiftKey);
        return;
    }

    selection.pressTimer.current = window.setTimeout(() => {
        if (!onLibrarySelectionChange) {return;}
        selection.setIsSelecting(true);
        selection.setLastSelectedIdx(index);
        onLibrarySelectionChange(new Set([item.asset.id]));
    }, 500);
}

function extendSelection(
    item: LayoutItem,
    index: number,
    librarySelection: Set<string> | undefined,
    onLibrarySelectionChange: ((selection: Set<string>) => void) | undefined,
    selection: SelectionState
) {
    if (!selection.isSelecting || !librarySelection || !onLibrarySelectionChange) {return;}
    const next = new Set(librarySelection);
    next.add(item.asset.id);
    onLibrarySelectionChange(next);
    selection.setLastSelectedIdx(index);
}

function handleTileClick(
    item: LayoutItem,
    librarySelection: Set<string> | undefined,
    onAssetClick: ((id: string) => void) | undefined,
    selection: SelectionState
) {
    clearPressTimer(selection.pressTimer);
    if (!(librarySelection && librarySelection.size > 0)) {
        onAssetClick?.(item.asset.id);
    }
}

function LayoutTile({
    item,
    index,
    debug,
    selectedAssetId,
    activeFilter,
    showFaces,
    onUntagAsset,
    onSetSensitivity,
    onAssetClick,
    librarySelection,
    onLibrarySelectionChange,
    declusteredAssets,
    selection,
    prioritizeImage,
}: LayoutTileProps) {
    const isSelected = librarySelection?.has(item.asset.id) || selectedAssetId === item.asset.id;
    const isDeclustered = declusteredAssets?.has(item.asset.id);
    const shellStyle = useMemo(() => ({
        ...getTileShellStyle(isDeclustered, isSelected),
        gridColumn: `span ${item.spanW}`,
        gridRow: `span ${item.spanH}`,
    }), [isDeclustered, isSelected, item.spanH, item.spanW]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        beginSelection(e, item, index, librarySelection, onLibrarySelectionChange, selection);
    }, [index, item, librarySelection, onLibrarySelectionChange, selection]);

    const onPointerEnter = useCallback(() => {
        extendSelection(item, index, librarySelection, onLibrarySelectionChange, selection);
    }, [index, item, librarySelection, onLibrarySelectionChange, selection]);

    const onClick = useCallback(() => {
        handleTileClick(item, librarySelection, onAssetClick, selection);
    }, [item, librarySelection, onAssetClick, selection]);

    return (
        <div
            key={item.asset.id || index}
            style={shellStyle}
            onPointerDown={onPointerDown}
            onPointerUp={() => clearPressTimer(selection.pressTimer)}
            onPointerLeave={() => clearPressTimer(selection.pressTimer)}
            onPointerEnter={onPointerEnter}
            onClick={onClick}
        >
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
                imageLoading={prioritizeImage ? 'eager' : 'lazy'}
                imageFetchPriority={prioritizeImage ? 'high' : 'auto'}
            />
        </div>
    );
}

export function LayoutEngine({
    assets, debug = false, onAssetClick, selectedAssetId,
    activeFilter, showFaces, onUntagAsset, onSetSensitivity,
    librarySelection, onLibrarySelectionChange, declusteredAssets
}: LayoutEngineProps) {
    const layoutItems = useMemo(() => computeLayout(assets), [assets]);
    const selection = useSelectionInteractions(layoutItems, librarySelection, onLibrarySelectionChange);

    return (
        <div
            className="layout-grid"
            style={{
                display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gridAutoFlow: 'dense',
                gridAutoRows: 'min(75px, 4.1vw)', gap: '2px', padding: '2px', width: '100%',
                maxWidth: '1800px', margin: '0 auto',
            }}
        >
            {layoutItems.map((item, i) => {
                return (
                    <LayoutTile
                        key={item.asset.id || i}
                        item={item}
                        index={i}
                        debug={debug}
                        selectedAssetId={selectedAssetId}
                        activeFilter={activeFilter}
                        showFaces={showFaces}
                        onUntagAsset={onUntagAsset}
                        onSetSensitivity={onSetSensitivity}
                        onAssetClick={onAssetClick}
                        librarySelection={librarySelection}
                        onLibrarySelectionChange={onLibrarySelectionChange}
                        declusteredAssets={declusteredAssets}
                        selection={selection}
                        prioritizeImage={i < PRIORITY_TILE_COUNT}
                    />
                );
            })}
        </div>
    );
}
