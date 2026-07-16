import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
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
    readonly librarySelectionRef: RefObject<LibrarySelectionState | null>;
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
    readonly isSelected: boolean;
    readonly hasSelection: boolean;
}

type LayoutTileEventHandlers = {
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    onDoubleClick: () => void;
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerEnter: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerLeave: () => void; onPointerUp: () => void;
}

const LONG_PRESS_MS = 250;

function calculateScrollSpeed(relativeY: number, viewHeight: number): number {
    const threshold = 80;
    if (relativeY < threshold) {
        return -Math.min(25, (threshold - relativeY) / 3);
    }
    if (relativeY > viewHeight - threshold) {
        return Math.min(25, (relativeY - (viewHeight - threshold)) / 3);
    }
    return 0;
}

function findSelectionKeyAtCoordinates(rect: { top: number; bottom: number; left: number; right: number }, clientX: number, speed: number): string | null {
    const targetY = speed < 0 ? rect.top + 10 : rect.bottom - 10;
    const targetX = Math.max(rect.left + 10, Math.min(rect.right - 10, clientX));
    const el = document.elementFromPoint(targetX, targetY);
    return el?.closest('[data-selection-key]')?.getAttribute('data-selection-key') ?? null;
}

function updateSelectionRange(selectionKey: string, layoutItems: LayoutItem[], selectionState: SelectionInteractionState) {
    const newIndex = layoutItems.findIndex(item => item.item.selectionKey === selectionKey);
    const anchorIndex = selectionState.dragSelectionRef.current.anchorIndex;
    if (newIndex !== -1 && anchorIndex !== null) {
        let cappedIndex = newIndex;
        if (Math.abs(newIndex - anchorIndex) > 1000) {
            cappedIndex = anchorIndex + Math.sign(newIndex - anchorIndex) * 1000;
        }
        selectionState.setDragRange({ anchorIndex, currentIndex: cappedIndex });
    }
}

function useDragAutoScroll(
    scrollContainerRef: RefObject<HTMLDivElement | null> | undefined,
    isSelecting: boolean,
    layoutItems: LayoutItem[],
    selectionState: SelectionInteractionState,
) {
    const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!isSelecting) {
            if (scrollIntervalRef.current) {
                clearInterval(scrollIntervalRef.current);
                scrollIntervalRef.current = null;
            }
            return;
        }

        const handlePointerMove = (e: PointerEvent) => {
            pointerPosRef.current = { x: e.clientX, y: e.clientY };
        };

        const performScrollStep = () => {
            const pos = pointerPosRef.current;
            if (!pos) {return;}

            const scrollContainer = scrollContainerRef?.current;
            const viewHeight = scrollContainer ? scrollContainer.clientHeight : window.innerHeight;
            const rect = scrollContainer ? scrollContainer.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };

            const relativeY = pos.y - rect.top;
            const speed = calculateScrollSpeed(relativeY, viewHeight);

            if (speed !== 0) {
                if (scrollContainer) {
                    scrollContainer.scrollBy({ top: speed, behavior: 'auto' });
                } else {
                    window.scrollBy({ top: speed, behavior: 'auto' });
                }

                const selectionKey = findSelectionKeyAtCoordinates(rect, pos.x, speed);
                if (selectionKey) {
                    updateSelectionRange(selectionKey, layoutItems, selectionState);
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        scrollIntervalRef.current = setInterval(performScrollStep, 16);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            if (scrollIntervalRef.current) {
                clearInterval(scrollIntervalRef.current);
                scrollIntervalRef.current = null;
            }
        };
    }, [isSelecting, scrollContainerRef, layoutItems, selectionState]);
}

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

    return useMemo(() => ({
        dragSelectionRef,
        isSelecting,
        setIsSelecting,
        pressTimer,
        stopDragging,
        dragRange,
        setDragRange,
        originalSelectionRef
    }), [isSelecting, dragRange, stopDragging]);
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

    const isToggleClick = event.target instanceof Element && event.target.closest('[data-selection-toggle="true"]');
    if (isToggleClick) {
        clearPressTimer(selectionState.pressTimer);
        return;
    }

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

    const isToggleClick = event.target instanceof Element && event.target.closest('[data-selection-toggle="true"]');
    const selectionMode = isToggleClick
        ? 'toggle'
        : getClickSelectionMode(event, hasLibrarySelection(librarySelection));

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

function handlePointerDownHelper(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
    layoutItems: LayoutItem[],
    librarySelectionRef: RefObject<LibrarySelectionState | null>,
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
    selectionState: SelectionInteractionState,
    longPressedRef: RefObject<boolean>,
) {
    longPressedRef.current = false;
    const isToggleClick = event.target instanceof Element && event.target.closest('[data-selection-toggle="true"]');
    if (isToggleClick) {
        clearPressTimer(selectionState.pressTimer);
        return;
    }
    const selection = librarySelectionRef.current ?? createEmptyLibrarySelectionState();
    beginSelection({ event, index, layoutItems, librarySelection: selection, onLibrarySelectionChange, selectionState, longPressedRef });
}

function handlePointerEnterHelper(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
    layoutItems: LayoutItem[],
    librarySelectionRef: RefObject<LibrarySelectionState | null>,
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
    selectionState: SelectionInteractionState,
) {
    const selection = librarySelectionRef.current ?? createEmptyLibrarySelectionState();
    extendSelection({ event, index, layoutItems, librarySelection: selection, onLibrarySelectionChange, selectionState });
}

function handleClickHelper(
    event: ReactMouseEvent<HTMLButtonElement>,
    index: number,
    layoutItem: LayoutItem,
    layoutItems: LayoutItem[],
    librarySelectionRef: RefObject<LibrarySelectionState | null>,
    onAssetClick: ((id: string) => void) | undefined,
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
    selectionState: SelectionInteractionState,
    longPressedRef: RefObject<boolean>,
) {
    const selection = librarySelectionRef.current ?? createEmptyLibrarySelectionState();
    handleTileClick({ event, index, layoutItem, layoutItems, librarySelection: selection, onAssetClick, onLibrarySelectionChange, selectionState, longPressedRef });
}

function handlePointerUpHelper(
    selectionState: SelectionInteractionState,
    librarySelectionRef: RefObject<LibrarySelectionState | null>,
    layoutItems: LayoutItem[],
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
    longPressedRef: RefObject<boolean>,
) {
    clearPressTimer(selectionState.pressTimer);
    const range = selectionState.dragRange;
    if (range && range.currentIndex !== range.anchorIndex) {
        longPressedRef.current = true;
        const originalSelection = selectionState.originalSelectionRef.current ?? librarySelectionRef.current ?? createEmptyLibrarySelectionState();
        commitDragSelection(range, originalSelection, layoutItems, onLibrarySelectionChange);
    }
    selectionState.setDragRange(null);
    selectionState.stopDragging();
}

function useLayoutTileEventHandlers(params: {
    index: number;
    layoutItem: LayoutItem;
    layoutItems: LayoutItem[];
    librarySelectionRef: RefObject<LibrarySelectionState | null>;
    onAssetClick?: (id: string) => void;
    onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
    selectionState: SelectionInteractionState;
    showInfoPanel: boolean;
}): LayoutTileEventHandlers {
    const {
        index,
        layoutItem,
        layoutItems,
        librarySelectionRef,
        onAssetClick,
        onLibrarySelectionChange,
        selectionState,
    } = params;

    const longPressedRef = useRef(false);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        handlePointerDownHelper(event, index, layoutItems, librarySelectionRef, onLibrarySelectionChange, selectionState, longPressedRef);
    }, [index, layoutItems, librarySelectionRef, onLibrarySelectionChange, selectionState]);

    const onPointerEnter = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        handlePointerEnterHelper(event, index, layoutItems, librarySelectionRef, onLibrarySelectionChange, selectionState);
    }, [index, layoutItems, librarySelectionRef, onLibrarySelectionChange, selectionState]);

    const onClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
        handleClickHelper(event, index, layoutItem, layoutItems, librarySelectionRef, onAssetClick, onLibrarySelectionChange, selectionState, longPressedRef);
    }, [index, layoutItem, layoutItems, librarySelectionRef, onAssetClick, onLibrarySelectionChange, selectionState]);

    const onDoubleClick = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);
    }, [selectionState.pressTimer]);

    const onPointerUp = useCallback(() => {
        handlePointerUpHelper(selectionState, librarySelectionRef, layoutItems, onLibrarySelectionChange, longPressedRef);
    }, [selectionState, librarySelectionRef, layoutItems, onLibrarySelectionChange]);

    const onPointerLeave = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);
    }, [selectionState.pressTimer]);

    return { onClick, onDoubleClick, onPointerDown, onPointerEnter, onPointerLeave, onPointerUp };
}

function useLayoutTileStyle(params: {
    shellStyleOverride?: CSSProperties;
    layoutItem: LayoutItem;
}) {
    const { shellStyleOverride, layoutItem } = params;
    return useMemo(() => {
        if (shellStyleOverride) {
            return {
                width: shellStyleOverride.width,
                height: shellStyleOverride.height,
            };
        }
        return {
            gridColumn: `span ${layoutItem.spanW}`,
            gridRow: `span ${layoutItem.spanH}`,
        };
    }, [shellStyleOverride, layoutItem.spanW, layoutItem.spanH]);
}

function LayoutTile({
    layoutItem,
    index,
    debug,
    activeFilter,
    showFaces,
    onUntagAsset,
    onAssetClick,
    librarySelectionRef,
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
    isSelected,
    hasSelection,
}: LayoutTileProps) {
    const isDeclustered = declusteredAssets?.has(layoutItem.item.asset.id);
    const inlineStyle = useLayoutTileStyle({ shellStyleOverride, layoutItem });

    const declusteredClasses = isDeclustered ? 'opacity-40 grayscale' : 'opacity-100 grayscale-0';
    const selectedClasses = isSelected ? 'scale-95' : 'scale-100';
    const flexClasses = shellStyleOverride ? 'flex-none' : '';

    const { onClick, onDoubleClick, onPointerDown, onPointerEnter, onPointerLeave, onPointerUp } = useLayoutTileEventHandlers({
        index,
        layoutItem,
        layoutItems,
        librarySelectionRef,
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
            className={`text-left font-inherit text-inherit p-0 border-none bg-transparent relative select-none rounded-md overflow-hidden motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out outline-none focus:outline-none active:scale-[0.93] ${declusteredClasses} ${selectedClasses} ${flexClasses}`}
            style={inlineStyle}
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
                hasSelection={hasSelection}
            />
        </button>
    );
}

function compareBasicProps(prev: LayoutTileProps, next: LayoutTileProps): boolean {
    return (
        prev.index === next.index &&
        prev.isSelected === next.isSelected &&
        prev.hasSelection === next.hasSelection &&
        prev.prioritizeImage === next.prioritizeImage &&
        prev.isScrollSettled === next.isScrollSettled &&
        prev.showInfoPanel === next.showInfoPanel &&
        prev.showGroupIds === next.showGroupIds &&
        prev.hoveredGroupId === next.hoveredGroupId
    );
}

function compareGeometryProps(prev: LayoutTileProps, next: LayoutTileProps): boolean {
    return (
        prev.layoutItem.item.asset.id === next.layoutItem.item.asset.id &&
        prev.layoutItem.item.asset.width === next.layoutItem.item.asset.width &&
        prev.layoutItem.item.asset.height === next.layoutItem.item.asset.height &&
        prev.layoutItem.spanW === next.layoutItem.spanW &&
        prev.layoutItem.spanH === next.layoutItem.spanH &&
        prev.shellStyleOverride?.width === next.shellStyleOverride?.width &&
        prev.shellStyleOverride?.height === next.shellStyleOverride?.height
    );
}

function compareDeclusteredProps(prev: LayoutTileProps, next: LayoutTileProps): boolean {
    return (
        prev.declusteredAssets === next.declusteredAssets ||
        prev.declusteredAssets?.has(prev.layoutItem.item.asset.id) === next.declusteredAssets?.has(next.layoutItem.item.asset.id)
    );
}

const MemoizedLayoutTile = memo(LayoutTile, (prev, next) => {
    return compareBasicProps(prev, next) && compareGeometryProps(prev, next) && compareDeclusteredProps(prev, next);
});

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
    librarySelectionRef: RefObject<LibrarySelectionState | null>;
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

    const isSelected = isItemSelected(params.librarySelection, layoutItem.item) ||
        params.selectedAssetId === layoutItem.item.asset.id ||
        (() => {
            if (!params.selectionState.dragRange) {return false;}
            const { anchorIndex, currentIndex } = params.selectionState.dragRange;
            const start = Math.min(anchorIndex, currentIndex);
            const end = Math.max(anchorIndex, currentIndex);
            return params.index >= start && params.index <= end;
        })();
    const hasSelection = hasLibrarySelection(params.librarySelection);

    return (
        <MemoizedLayoutTile
            key={layoutItem.item.selectionKey}
            layoutItem={layoutItem}
            index={params.index}
            debug={params.debug}
            selectedAssetId={params.selectedAssetId}
            activeFilter={params.activeFilter}
            showFaces={params.showFaces}
            onUntagAsset={params.onUntagAsset}
            onAssetClick={params.onAssetClick}
            librarySelectionRef={params.librarySelectionRef}
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
            isSelected={isSelected}
            hasSelection={hasSelection}
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
    const librarySelectionRef = useRef(librarySelection);
    useEffect(() => {
        librarySelectionRef.current = librarySelection;
    }, [librarySelection]);

    useDragAutoScroll(
        scrollContainerRef,
        selectionState.isSelecting,
        layoutItems,
        selectionState,
    );

    return (
        <LayoutModeRenderer
            layoutMode={layoutMode}
            justifiedItems={layoutItems.map((layoutItem) => ({
                id: layoutItem.item.selectionKey,
                width: layoutItem.item.asset.width,
                height: layoutItem.item.asset.height,
                selectableItem: layoutItem.item,
            }))}
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
                librarySelectionRef,
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
