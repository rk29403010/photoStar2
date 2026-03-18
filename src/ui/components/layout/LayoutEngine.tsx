import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type { TileIntent } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { Tile } from './Tile';
import {
    createEmptyLibrarySelectionState,
    getLibrarySelectionCount,
    hasLibrarySelection,
    isItemSelected,
    updateLibrarySelection,
    type LibrarySelectableItem,
    type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';

interface LayoutEngineProps {
    items: LibrarySelectableItem[];
    debug?: boolean;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    librarySelection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    declusteredAssets?: Set<string>;
    onHoverAssetChange?: (asset: LibrarySelectableItem['asset'] | null) => void;
    showGroupIds?: boolean;
}

type LayoutItem = { item: LibrarySelectableItem; intent: TileIntent; spanW: number; spanH: number };

interface SelectionInteractionState {
    dragSelectionRef: MutableRefObject<{
        active: boolean;
        anchorIndex: number | null;
    }>;
    isSelecting: boolean;
    setIsSelecting: (value: boolean) => void;
    pressTimer: MutableRefObject<number | null>;
    stopDragging: () => void;
}

interface LayoutTileProps {
    layoutItem: LayoutItem;
    index: number;
    debug: boolean;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onAssetClick?: (id: string) => void;
    librarySelection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    declusteredAssets?: Set<string>;
    selectionState: SelectionInteractionState;
    prioritizeImage: boolean;
    onHoverAssetChange?: (asset: LibrarySelectableItem['asset'] | null) => void;
    layoutItems: LayoutItem[];
    showGroupIds?: boolean;
}

const PRIORITY_TILE_COUNT = 60;
const LONG_PRESS_MS = 420;

const computeLayout = (items: LibrarySelectableItem[]): LayoutItem[] => items.map((item) => {
    const h = item.asset.height || 1;
    const w = item.asset.width || 1;
    const ratio = w / h;
    const targetRatios = [
        { ratio: 1, spanW: 3, spanH: 3 }, { ratio: 4 / 3, spanW: 4, spanH: 3 }, { ratio: 3 / 4, spanW: 3, spanH: 4 },
        { ratio: 3 / 2, spanW: 3, spanH: 2 }, { ratio: 2 / 3, spanW: 2, spanH: 3 }, { ratio: 16 / 9, spanW: 4, spanH: 2 },
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
    let intent: TileIntent = 'normal';
    const isHero = item.asset.manualState?.forceHero || (item.asset.processingPhase === 2 && item.asset.layoutCapabilities?.heroEligible);
    if (isHero) {
        intent = 'hero';
        spanW = Math.min(Math.round(spanW * 2), 24);
        spanH = Math.round(spanH * 2);
    }

    return { item, intent, spanW, spanH };
});

function clearPressTimer(pressTimer: MutableRefObject<number | null>) {
    if (!pressTimer.current) {return;}
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
}

function buildSelectAllSelection(layoutItems: LayoutItem[]) {
    return updateLibrarySelection(
        layoutItems.map((layoutItem) => layoutItem.item),
        createEmptyLibrarySelectionState(),
        { mode: 'select_all' },
    );
}

function useSelectAllShortcut(
    layoutItems: LayoutItem[],
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
    setIsSelecting: (value: boolean) => void,
) {
    useEffect(() => {
        const handlePointerUp = () => setIsSelecting(false);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') {return;}
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {return;}
            if (!onLibrarySelectionChange) {return;}
            event.preventDefault();
            onLibrarySelectionChange(buildSelectAllSelection(layoutItems));
        };

        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [layoutItems, onLibrarySelectionChange, setIsSelecting]);
}

function useSelectionInteractions(
    layoutItems: LayoutItem[],
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void,
): SelectionInteractionState {
    const [isSelecting, setIsSelecting] = useState(false);
    const dragSelectionRef = useRef<{ active: boolean; anchorIndex: number | null }>({
        active: false,
        anchorIndex: null,
    });
    const pressTimer = useRef<number | null>(null);
    const stopDragging = useCallback(() => {
        dragSelectionRef.current = {
            ...dragSelectionRef.current,
            active: false,
        };
    }, []);

    useSelectAllShortcut(layoutItems, onLibrarySelectionChange, setIsSelecting);

    return { dragSelectionRef, isSelecting, setIsSelecting, pressTimer, stopDragging };
}

function getTileShellStyle(isDeclustered: boolean | undefined, isSelected: boolean) {
    return {
        gridColumn: 'span 1',
        gridRow: 'span 1',
        opacity: isDeclustered ? 0.4 : 1,
        filter: isDeclustered ? 'grayscale(80%)' : 'none',
        position: 'relative' as const,
        userSelect: 'none' as const,
        transform: isSelected ? 'scale(0.97)' : 'none',
        transition: 'transform 0.18s ease-out',
        borderRadius: '6px',
        overflow: 'hidden',
    };
}

function applySelectionChange(
    layoutItems: LayoutItem[],
    librarySelection: LibrarySelectionState,
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
    action: Parameters<typeof updateLibrarySelection>[2],
) {
    if (!onLibrarySelectionChange) {return;}
    const nextSelection = updateLibrarySelection(layoutItems.map((layoutItem) => layoutItem.item), librarySelection, action);
    onLibrarySelectionChange(nextSelection);
}

function beginSelection(params: {
    event: ReactPointerEvent<HTMLDivElement>;
    index: number;
    layoutItems: LayoutItem[];
    librarySelection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    selectionState: SelectionInteractionState;
}) {
    const { event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState } = params;
    if (event.button !== 0) {return;}

    const modifierToggle = event.ctrlKey || event.metaKey;
    const modifierRange = event.shiftKey;
    if (modifierToggle || modifierRange || hasLibrarySelection(librarySelection)) {
        clearPressTimer(selectionState.pressTimer);
        selectionState.setIsSelecting(true);
        selectionState.dragSelectionRef.current = { active: false, anchorIndex: index };
        applySelectionChange(layoutItems, librarySelection, onLibrarySelectionChange, {
            mode: modifierRange ? 'range' : modifierToggle ? 'toggle' : 'replace',
            index,
        });
        return;
    }

    selectionState.pressTimer.current = window.setTimeout(() => {
        selectionState.setIsSelecting(true);
        selectionState.dragSelectionRef.current = { active: true, anchorIndex: index };
        applySelectionChange(layoutItems, createEmptyLibrarySelectionState(), onLibrarySelectionChange, {
            mode: 'replace',
            index,
        });
    }, LONG_PRESS_MS);
}

function extendSelection(params: {
    event: ReactPointerEvent<HTMLDivElement>;
    index: number;
    layoutItems: LayoutItem[];
    librarySelection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    selectionState: SelectionInteractionState;
}) {
    const { event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState } = params;
    if (!selectionState.dragSelectionRef.current.active || event.buttons !== 1) {return;}
    applySelectionChange(layoutItems, librarySelection, onLibrarySelectionChange, { mode: 'range', index });
}

function handleTileClick(
    layoutItem: LayoutItem,
    librarySelection: LibrarySelectionState,
    onAssetClick: ((id: string) => void) | undefined,
    selectionState: SelectionInteractionState,
) {
    clearPressTimer(selectionState.pressTimer);
    if (getLibrarySelectionCount(librarySelection) === 0) {
        onAssetClick?.(layoutItem.item.asset.id);
    }
}

function LayoutTile({
    layoutItem,
    index,
    debug,
    selectedAssetId,
    activeFilter,
    showFaces,
    onUntagAsset,
    onAssetClick,
    librarySelection,
    onLibrarySelectionChange,
    declusteredAssets,
    selectionState,
    prioritizeImage,
    onHoverAssetChange,
    layoutItems,
    showGroupIds,
}: LayoutTileProps) {
    const isSelected = isItemSelected(librarySelection, layoutItem.item) || selectedAssetId === layoutItem.item.asset.id;
    const isDeclustered = declusteredAssets?.has(layoutItem.item.asset.id);
    const shellStyle = useMemo(() => ({
        ...getTileShellStyle(isDeclustered, isSelected),
        gridColumn: `span ${layoutItem.spanW}`,
        gridRow: `span ${layoutItem.spanH}`,
    }), [isDeclustered, isSelected, layoutItem.spanH, layoutItem.spanW]);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        beginSelection({
            event,
            index,
            layoutItems,
            librarySelection,
            onLibrarySelectionChange,
            selectionState,
        });
    }, [index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState]);

    const onPointerEnter = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        extendSelection({
            event,
            index,
            layoutItems,
            librarySelection,
            onLibrarySelectionChange,
            selectionState,
        });
    }, [index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState]);

    const onClick = useCallback(() => {
        handleTileClick(layoutItem, librarySelection, onAssetClick, selectionState);
    }, [layoutItem, librarySelection, onAssetClick, selectionState]);

    return (
        <div
            key={layoutItem.item.selectionKey}
            style={shellStyle}
            onPointerDown={onPointerDown}
            onPointerUp={() => {
                clearPressTimer(selectionState.pressTimer);
                selectionState.stopDragging();
            }}
            onPointerLeave={() => clearPressTimer(selectionState.pressTimer)}
            onPointerEnter={onPointerEnter}
            onClick={onClick}
        >
            <Tile
                asset={layoutItem.item.asset}
                intent={layoutItem.intent}
                debug={debug}
                selected={isSelected}
                activeFilter={activeFilter}
                showFaces={showFaces}
                onUntagAsset={onUntagAsset}
                onHoverAssetChange={onHoverAssetChange}
                imageLoading={prioritizeImage ? 'eager' : 'lazy'}
                imageFetchPriority={prioritizeImage ? 'high' : 'auto'}
                isGroupRepresentative={layoutItem.item.entityType === 'group'}
                showGroupIds={showGroupIds}
            />
        </div>
    );
}

export function LayoutEngine({
    items,
    debug = false,
    onAssetClick,
    selectedAssetId,
    activeFilter,
    showFaces,
    onUntagAsset,
    librarySelection,
    onLibrarySelectionChange,
    declusteredAssets,
    onHoverAssetChange,
    showGroupIds,
}: LayoutEngineProps) {
    const layoutItems = useMemo(() => computeLayout(items), [items]);
    const selectionState = useSelectionInteractions(layoutItems, onLibrarySelectionChange);

    return (
        <div
            className="layout-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(24, 1fr)',
                gridAutoFlow: 'dense',
                gridAutoRows: 'min(75px, 4.1vw)',
                gap: '2px',
                padding: '2px',
                width: '100%',
                maxWidth: '1800px',
                margin: '0 auto',
            }}
        >
            {layoutItems.map((layoutItem, index) => (
                <LayoutTile
                    key={layoutItem.item.selectionKey}
                    layoutItem={layoutItem}
                    index={index}
                    debug={debug}
                    selectedAssetId={selectedAssetId}
                    activeFilter={activeFilter}
                    showFaces={showFaces}
                    onUntagAsset={onUntagAsset}
                    onAssetClick={onAssetClick}
                    librarySelection={librarySelection}
                    onLibrarySelectionChange={onLibrarySelectionChange}
                    declusteredAssets={declusteredAssets}
                    selectionState={selectionState}
                    prioritizeImage={index < PRIORITY_TILE_COUNT}
                    onHoverAssetChange={onHoverAssetChange}
                    layoutItems={layoutItems}
                    showGroupIds={showGroupIds}
                />
            ))}
        </div>
    );
}
