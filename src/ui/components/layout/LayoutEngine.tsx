import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { Tile } from './Tile';
import { buildGalleryTileLayout, type GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { LayoutModeRenderer } from './LayoutModeRenderer';
import { GALLERY_EAGER_PREVIEW_COUNT, GALLERY_ROW_GAP_PX, GALLERY_TILE_GAP_PX } from '../library/galleryBrowseRailModel';
import {
    createEmptyLibrarySelectionState,
    hasLibrarySelection,
    isItemSelected,
    updateLibrarySelection,
    type LibrarySelectableItem,
    type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';
import { buildGalleryTimeSections, type GalleryTimeSection, type GalleryTimeSectionMode } from './galleryTimeSections';
import type { TimelineJumpRequest } from '../library/libraryTimelineJump';
type LayoutEngineProps = {
    readonly items: LibrarySelectableItem[];
    readonly debug?: boolean;
    readonly onAssetClick?: (id: string) => void;
    readonly selectedAssetId?: string | null;
    readonly activeFilter?: LibraryFilter;
    readonly showFaces?: boolean;
    readonly onUntagAsset?: (assetId: string, personId: string) => void;
    readonly librarySelection: LibrarySelectionState;
    readonly onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    readonly declusteredAssets?: Set<string>;
    readonly onHoverAssetChange?: (asset: LibrarySelectableItem['asset'] | null) => void;
    readonly showGroupIds?: boolean;
    readonly hoveredGroupId?: string | null;
    readonly onHoveredGroupIdChange?: (groupId: string | null) => void;
    readonly layoutMode?: GalleryLayoutMode;
    readonly scrollContainerRef?: RefObject<HTMLDivElement | null>;
    readonly showInfoPanel?: boolean;
    readonly isScrollSettled?: boolean;
    readonly targetRowHeight?: number;
    readonly onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    readonly onVisibleTimelineGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
    readonly justifiedSections?: GalleryTimeSection[];
    readonly timeSectionMode?: GalleryTimeSectionMode;
    readonly timelineJumpRequest?: TimelineJumpRequest | null;
}

type LayoutItem = { item: LibrarySelectableItem; intent: ReturnType<typeof buildGalleryTileLayout>['intent']; spanW: number; spanH: number };

type SelectionInteractionState = {
    dragSelectionRef: RefObject<{ active: boolean; anchorIndex: number | null }>;
    isSelecting: boolean;
    setIsSelecting: (value: boolean) => void;
    pressTimer: RefObject<ReturnType<typeof setTimeout> | null>;
    stopDragging: () => void;
    dragRange: { anchorIndex: number; currentIndex: number } | null;
    setDragRange: (range: { anchorIndex: number; currentIndex: number } | null) => void;
    originalSelectionRef: RefObject<LibrarySelectionState | null>;
}

type LayoutTileProps = {
    readonly layoutItem: LayoutItem;
    readonly index: number;
    readonly debug: boolean;
    readonly selectedAssetId?: string | null;
    readonly activeFilter?: LibraryFilter;
    readonly showFaces?: boolean;
    readonly onUntagAsset?: (assetId: string, personId: string) => void;
    readonly onAssetClick?: (id: string) => void;
    readonly librarySelection: LibrarySelectionState;
    readonly onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    readonly declusteredAssets?: Set<string>;
    readonly selectionState: SelectionInteractionState;
    readonly prioritizeImage: boolean;
    readonly onHoverAssetChange?: (asset: LibrarySelectableItem['asset'] | null) => void;
    readonly layoutItems: LayoutItem[];
    readonly showGroupIds?: boolean;
    readonly hoveredGroupId?: string | null;
    readonly onHoveredGroupIdChange?: (groupId: string | null) => void;
    readonly showInfoPanel: boolean;
    readonly isScrollSettled: boolean;
    readonly shellStyleOverride?: CSSProperties;
}

type LayoutTileEventHandlers = {
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    onDoubleClick: () => void;
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerEnter: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerLeave: () => void; onPointerUp: () => void;
}

const LONG_PRESS_MS = 420;

const computeLayout = (items: LibrarySelectableItem[], layoutMode: GalleryLayoutMode): LayoutItem[] => items.map((item) => {
    const layout = buildGalleryTileLayout(item.asset, layoutMode);
    return { item, ...layout };
});

function clearPressTimer(pressTimer: RefObject<ReturnType<typeof setTimeout> | null>) {
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

        globalThis.addEventListener('mouseup', handlePointerUp);
        globalThis.addEventListener('keydown', handleKeyDown);
        return () => {
            globalThis.removeEventListener('mouseup', handlePointerUp);
            globalThis.removeEventListener('keydown', handleKeyDown);
        };
    }, [layoutItems, onLibrarySelectionChange, setIsSelecting]);
}

function useSelectionInteractions(
    layoutItems: LayoutItem[],
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void,
): SelectionInteractionState {
    const [isSelecting, setIsSelecting] = useState(false);
    const dragSelectionRef = useRef<{ active: boolean; anchorIndex: number | null }>({ active: false, anchorIndex: null });
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dragRange, setDragRange] = useState<{ anchorIndex: number; currentIndex: number } | null>(null);
    const originalSelectionRef = useRef<LibrarySelectionState | null>(null);

    const stopDragging = useCallback(() => {
        dragSelectionRef.current = { ...dragSelectionRef.current, active: false };
    }, []);

    useSelectAllShortcut(layoutItems, onLibrarySelectionChange, setIsSelecting);

    return { dragSelectionRef, isSelecting, setIsSelecting, pressTimer, stopDragging, dragRange, setDragRange, originalSelectionRef };
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
    event: ReactPointerEvent<HTMLButtonElement>;
    index: number;
    layoutItems: LayoutItem[];
    librarySelection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    selectionState: SelectionInteractionState;
    longPressedRef: RefObject<boolean>;
}) {
    const { event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState, longPressedRef } = params;
    if (event.button !== 0) {return;}

    selectionState.originalSelectionRef.current = librarySelection;

    const modifierToggle = event.ctrlKey || event.metaKey;
    const modifierRange = event.shiftKey;
    if (modifierToggle || modifierRange || hasLibrarySelection(librarySelection)) {
        clearPressTimer(selectionState.pressTimer);
        selectionState.dragSelectionRef.current = { active: true, anchorIndex: index };
        selectionState.setDragRange({ anchorIndex: index, currentIndex: index });
        return;
    }

    selectionState.pressTimer.current = globalThis.setTimeout(() => {
        longPressedRef.current = true;
        selectionState.setIsSelecting(true);
        selectionState.dragSelectionRef.current = { active: true, anchorIndex: index };
        selectionState.setDragRange({ anchorIndex: index, currentIndex: index });
        applySelectionChange(layoutItems, createEmptyLibrarySelectionState(), onLibrarySelectionChange, {
            mode: 'replace',
            index,
        });
    }, LONG_PRESS_MS);
}

function extendSelection(params: {
    event: ReactPointerEvent<HTMLButtonElement>;
    index: number;
    layoutItems: LayoutItem[];
    librarySelection: LibrarySelectionState;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    selectionState: SelectionInteractionState;
}) {
    const { event, index, selectionState } = params;
    if (!selectionState.dragSelectionRef.current.active || event.buttons !== 1) {return;}

    const anchorIndex = selectionState.dragSelectionRef.current.anchorIndex;
    if (anchorIndex !== null) {
        selectionState.setDragRange({ anchorIndex, currentIndex: index });
    }
}

function getClickSelectionMode(
    event: ReactMouseEvent<HTMLButtonElement>,
    isSelectionActive: boolean,
): 'range' | 'toggle' | 'replace' | null {
    if (event.shiftKey) {
        return 'range';
    }
    if (event.ctrlKey || event.metaKey || isSelectionActive) {
        return 'toggle';
    }
    return null;
}

function handleTileClick(
    params: {
        event: ReactMouseEvent<HTMLButtonElement>;
        index: number;
        layoutItem: LayoutItem;
        layoutItems: LayoutItem[];
        librarySelection: LibrarySelectionState;
        onAssetClick: ((id: string) => void) | undefined;
        onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
        selectionState: SelectionInteractionState;
        longPressedRef: RefObject<boolean>;
    },
) {
    const {
        event,
        index,
        layoutItem,
        layoutItems,
        librarySelection,
        onAssetClick,
        onLibrarySelectionChange,
        selectionState,
        longPressedRef,
    } = params;

    clearPressTimer(selectionState.pressTimer);

    if (longPressedRef.current) {
        longPressedRef.current = false;
        return;
    }

    const selectionMode = getClickSelectionMode(event, hasLibrarySelection(librarySelection));
    if (selectionMode) {
        applySelectionChange(layoutItems, librarySelection, onLibrarySelectionChange, {
            mode: selectionMode,
            index,
        });
        return;
    }

    onAssetClick?.(layoutItem.item.asset.id);
}

function addItemToSet(item: LibrarySelectableItem, selection: { photoIds: Set<string>; groupIds: Set<string> }) {
    if (item.entityType === 'group' && item.groupId) {
        selection.groupIds.add(item.groupId);
    } else {
        selection.photoIds.add(item.photoId);
    }
}

function commitDragSelection(
    dragRange: { anchorIndex: number; currentIndex: number },
    originalSelection: LibrarySelectionState,
    layoutItems: LayoutItem[],
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void,
) {
    const { anchorIndex, currentIndex } = dragRange;
    const nextSelection = {
        photoIds: new Set(originalSelection.photoIds),
        groupIds: new Set(originalSelection.groupIds),
        anchorKey: originalSelection.anchorKey,
        mostRecentSelectionKey: originalSelection.mostRecentSelectionKey,
    };

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    for (let i = start; i <= end; i++) {
        const layoutItem = layoutItems[i];
        if (layoutItem) {
            addItemToSet(layoutItem.item, nextSelection);
        }
    }

    const lastItem = layoutItems[currentIndex];
    if (lastItem) {
        const anchorItem = layoutItems[anchorIndex];
        nextSelection.anchorKey = anchorItem ? anchorItem.item.selectionKey : null;
        nextSelection.mostRecentSelectionKey = lastItem.item.selectionKey;
    }

    if (onLibrarySelectionChange) {
        onLibrarySelectionChange(nextSelection);
    }
}

function useLayoutTileEventHandlers(params: {
    index: number;
    layoutItem: LayoutItem;
    layoutItems: LayoutItem[];
    librarySelection: LibrarySelectionState;
    onAssetClick?: (id: string) => void;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    selectionState: SelectionInteractionState;
    showInfoPanel: boolean;
}): LayoutTileEventHandlers {
    const {
        index,
        layoutItem,
        layoutItems,
        librarySelection,
        onAssetClick,
        onLibrarySelectionChange,
        selectionState,
    } = params;

    const longPressedRef = useRef(false);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        longPressedRef.current = false;
        beginSelection({ event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState, longPressedRef });
    }, [index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState]);

    const onPointerEnter = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        extendSelection({ event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState });
    }, [index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState]);

    const onClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
        handleTileClick({ event, index, layoutItem, layoutItems, librarySelection, onAssetClick, onLibrarySelectionChange, selectionState, longPressedRef });
    }, [index, layoutItem, layoutItems, librarySelection, onAssetClick, onLibrarySelectionChange, selectionState]);

    const onDoubleClick = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);
    }, [selectionState.pressTimer]);

    const onPointerUp = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);

        const hasDragged = selectionState.dragRange && selectionState.dragRange.currentIndex !== selectionState.dragRange.anchorIndex;
        if (hasDragged && selectionState.dragRange) {
            longPressedRef.current = true;
            commitDragSelection(
                selectionState.dragRange,
                selectionState.originalSelectionRef.current ?? librarySelection,
                layoutItems,
                onLibrarySelectionChange,
            );
        }

        selectionState.setDragRange(null);
        selectionState.stopDragging();
    }, [selectionState, layoutItems, librarySelection, onLibrarySelectionChange]);

    const onPointerLeave = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);
    }, [selectionState.pressTimer]);

    return { onClick, onDoubleClick, onPointerDown, onPointerEnter, onPointerLeave, onPointerUp };
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
    hoveredGroupId,
    onHoveredGroupIdChange,
    showInfoPanel,
    isScrollSettled,
    shellStyleOverride,
}: LayoutTileProps) {
    const isInDragRange = useMemo(() => {
        if (!selectionState.dragRange) {return false;}
        const { anchorIndex, currentIndex } = selectionState.dragRange;
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        return index >= start && index <= end;
    }, [selectionState.dragRange, index]);
    const isSelected = isItemSelected(librarySelection, layoutItem.item) || selectedAssetId === layoutItem.item.asset.id || isInDragRange;
    const isDeclustered = declusteredAssets?.has(layoutItem.item.asset.id);
    const shellStyle = useMemo(() => ({
        ...getTileShellStyle(isDeclustered, isSelected),
        ...(shellStyleOverride ?? {
            gridColumn: `span ${layoutItem.spanW}`,
            gridRow: `span ${layoutItem.spanH}`,
        }),
    }), [isDeclustered, isSelected, layoutItem.spanH, layoutItem.spanW, shellStyleOverride]);
    const { onClick, onDoubleClick, onPointerDown, onPointerEnter, onPointerLeave, onPointerUp } = useLayoutTileEventHandlers({
        index,
        layoutItem,
        layoutItems,
        librarySelection,
        onAssetClick,
        onLibrarySelectionChange,
        selectionState,
        showInfoPanel,
    });
    return (
        <button
            type="button"
            key={layoutItem.item.selectionKey}
            data-selection-key={layoutItem.item.selectionKey}
            style={{ ...shellStyle, textAlign: 'left', font: 'inherit', color: 'inherit', padding: 0, border: 'none', background: 'transparent' }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerEnter={onPointerEnter}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onDragStart={(e) => e.preventDefault()}
            draggable={false}
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
                imageLoading="eager"
                imageFetchPriority={prioritizeImage ? 'high' : 'auto'}
                isGroupRepresentative={layoutItem.item.entityType === 'group'}
                showGroupIds={Boolean(showGroupIds)}
                hoveredGroupId={hoveredGroupId}
                onHoveredGroupIdChange={onHoveredGroupIdChange}
                isScrollSettled={isScrollSettled}
            />
        </button>
    );
}

function renderLayoutTile(params: {
    layoutItems: LayoutItem[];
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
    onHoverAssetChange?: (asset: LibrarySelectableItem['asset'] | null) => void;
    showGroupIds?: boolean;
    hoveredGroupId?: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
    showInfoPanel: boolean;
    isScrollSettled: boolean;
    shellStyleOverride?: CSSProperties;
}) {
    const layoutItem = params.layoutItems[params.index];

    return (
        <LayoutTile
            key={layoutItem.item.selectionKey}
            layoutItem={layoutItem}
            index={params.index}
            debug={params.debug}
            selectedAssetId={params.selectedAssetId}
            activeFilter={params.activeFilter}
            showFaces={params.showFaces}
            onUntagAsset={params.onUntagAsset}
            onAssetClick={params.onAssetClick}
            librarySelection={params.librarySelection}
            onLibrarySelectionChange={params.onLibrarySelectionChange}
            declusteredAssets={params.declusteredAssets}
            selectionState={params.selectionState}
            prioritizeImage={params.index < GALLERY_EAGER_PREVIEW_COUNT}
            onHoverAssetChange={params.onHoverAssetChange}
            layoutItems={params.layoutItems}
            showGroupIds={params.showGroupIds}
            hoveredGroupId={params.hoveredGroupId}
            onHoveredGroupIdChange={params.onHoveredGroupIdChange}
            showInfoPanel={params.showInfoPanel}
            isScrollSettled={params.isScrollSettled}
            shellStyleOverride={params.shellStyleOverride}
        />
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
    hoveredGroupId,
    onHoveredGroupIdChange,
    layoutMode = 'tiled',
    scrollContainerRef,
    showInfoPanel = false,
    isScrollSettled = true,
    targetRowHeight,
    onTopVisibleSelectionKeyChange,
    onVisibleTimelineGroupChange,
    justifiedSections: explicitJustifiedSections,
    timeSectionMode = 'none',
    timelineJumpRequest,
}: LayoutEngineProps) {
    const layoutItems = useMemo(() => computeLayout(items, layoutMode), [items, layoutMode]);
    const justifiedSections = useMemo(
        () => explicitJustifiedSections ?? buildGalleryTimeSections(items, timeSectionMode),
        [explicitJustifiedSections, items, timeSectionMode],
    );
    const selectionState = useSelectionInteractions(layoutItems, onLibrarySelectionChange);
    return (
        <LayoutModeRenderer
            layoutMode={layoutMode}
            justifiedItems={layoutItems.map((layoutItem) => ({ id: layoutItem.item.selectionKey, width: layoutItem.item.asset.width, height: layoutItem.item.asset.height }))}
            justifiedSections={justifiedSections}
            timeSectionMode={timeSectionMode}
            scrollContainerRef={scrollContainerRef}
            itemCount={layoutItems.length}
            tileGap={GALLERY_TILE_GAP_PX}
            rowGap={GALLERY_ROW_GAP_PX}
            targetRowHeight={targetRowHeight}
            onTopVisibleSelectionKeyChange={onTopVisibleSelectionKeyChange}
            onVisibleTimelineGroupChange={onVisibleTimelineGroupChange}
            timelineJumpRequest={timelineJumpRequest}
            renderTile={(index, shellStyleOverride) => renderLayoutTile({
                layoutItems,
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
                onHoverAssetChange,
                showGroupIds,
                hoveredGroupId,
                onHoveredGroupIdChange,
                showInfoPanel,
                isScrollSettled,
                shellStyleOverride,
            })}
        />
    );
}
