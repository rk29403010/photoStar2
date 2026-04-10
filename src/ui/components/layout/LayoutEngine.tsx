import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { Tile } from './Tile';
import { buildGalleryTileLayout, type GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { LayoutModeRenderer } from './LayoutModeRenderer';
import { getSingleClickTileAction, shouldOpenAssetOnDoubleClick } from './layoutTileInteractionModel';
import { GALLERY_EAGER_PREVIEW_COUNT, GALLERY_ROW_GAP_PX, GALLERY_TILE_GAP_PX } from '../library/galleryBrowseRailModel';
import {
    createEmptyLibrarySelectionState,
    getLibrarySelectionCount,
    hasLibrarySelection,
    isItemSelected,
    updateLibrarySelection,
    type LibrarySelectableItem,
    type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';
import { buildGalleryTimeSections, type GalleryTimeSectionMode } from './galleryTimeSections';

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
    hoveredGroupId?: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
    layoutMode?: GalleryLayoutMode;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    showInfoPanel?: boolean;
    isScrollSettled?: boolean;
    targetRowHeight?: number;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    timeSectionMode?: GalleryTimeSectionMode;
}

type LayoutItem = { item: LibrarySelectableItem; intent: ReturnType<typeof buildGalleryTileLayout>['intent']; spanW: number; spanH: number };

interface SelectionInteractionState {
    dragSelectionRef: MutableRefObject<{ active: boolean; anchorIndex: number | null }>;
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
    hoveredGroupId?: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
    showInfoPanel: boolean;
    isScrollSettled: boolean;
    shellStyleOverride?: CSSProperties;
}

interface LayoutTileEventHandlers {
    onClick: () => void;
    onDoubleClick: () => void;
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerLeave: () => void; onPointerUp: () => void;
}

const LONG_PRESS_MS = 420;

const computeLayout = (items: LibrarySelectableItem[], layoutMode: GalleryLayoutMode): LayoutItem[] => items.map((item) => {
    const layout = buildGalleryTileLayout(item.asset, layoutMode);
    return { item, ...layout };
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
    const dragSelectionRef = useRef<{ active: boolean; anchorIndex: number | null }>({ active: false, anchorIndex: null });
    const pressTimer = useRef<number | null>(null);
    const stopDragging = useCallback(() => {
        dragSelectionRef.current = { ...dragSelectionRef.current, active: false };
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
    params: {
        index: number;
        layoutItem: LayoutItem;
        layoutItems: LayoutItem[];
        librarySelection: LibrarySelectionState;
        onAssetClick: ((id: string) => void) | undefined;
        onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
        selectionState: SelectionInteractionState;
        showInfoPanel: boolean;
    },
) {
    const {
        index,
        layoutItem,
        layoutItems,
        librarySelection,
        onAssetClick,
        onLibrarySelectionChange,
        selectionState,
        showInfoPanel,
    } = params;

    clearPressTimer(selectionState.pressTimer);
    const action = getSingleClickTileAction({
        showInfoPanel,
        selectionCount: getLibrarySelectionCount(librarySelection),
    });

    if (action === 'select') {
        applySelectionChange(layoutItems, librarySelection, onLibrarySelectionChange, { mode: 'replace', index });
        return;
    }

    if (action === 'open') {
        onAssetClick?.(layoutItem.item.asset.id);
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
        showInfoPanel,
    } = params;

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        beginSelection({ event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState });
    }, [index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState]);

    const onPointerEnter = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        extendSelection({ event, index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState });
    }, [index, layoutItems, librarySelection, onLibrarySelectionChange, selectionState]);

    const onClick = useCallback(() => {
        handleTileClick({ index, layoutItem, layoutItems, librarySelection, onAssetClick, onLibrarySelectionChange, selectionState, showInfoPanel });
    }, [index, layoutItem, layoutItems, librarySelection, onAssetClick, onLibrarySelectionChange, selectionState, showInfoPanel]);

    const onDoubleClick = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);
        if (shouldOpenAssetOnDoubleClick(showInfoPanel)) {
            onAssetClick?.(layoutItem.item.asset.id);
        }
    }, [layoutItem.item.asset.id, onAssetClick, selectionState.pressTimer, showInfoPanel]);

    const onPointerUp = useCallback(() => {
        clearPressTimer(selectionState.pressTimer);
        selectionState.stopDragging();
    }, [selectionState]);

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
    const isSelected = isItemSelected(librarySelection, layoutItem.item) || selectedAssetId === layoutItem.item.asset.id;
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
        <div
            key={layoutItem.item.selectionKey}
            data-selection-key={layoutItem.item.selectionKey}
            style={shellStyle}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerEnter={onPointerEnter}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
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
        </div>
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
    timeSectionMode = 'none',
}: LayoutEngineProps) {
    const layoutItems = useMemo(() => computeLayout(items, layoutMode), [items, layoutMode]);
    const justifiedSections = useMemo(() => buildGalleryTimeSections(items, timeSectionMode), [items, timeSectionMode]);
    const selectionState = useSelectionInteractions(layoutItems, onLibrarySelectionChange);
    return (
        <LayoutModeRenderer
            layoutMode={layoutMode}
            justifiedItems={layoutItems.map((layoutItem) => ({ id: layoutItem.item.selectionKey, width: layoutItem.item.asset.width, height: layoutItem.item.asset.height }))}
            justifiedSections={justifiedSections}
            scrollContainerRef={scrollContainerRef}
            itemCount={layoutItems.length}
            tileGap={GALLERY_TILE_GAP_PX}
            rowGap={GALLERY_ROW_GAP_PX}
            targetRowHeight={targetRowHeight}
            onTopVisibleSelectionKeyChange={onTopVisibleSelectionKeyChange}
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
