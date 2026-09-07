import type { Asset } from '@contracts/core';
import type { LibraryPresentationRelationshipKind } from '@contracts/libraryPresentation';

export type LibrarySelectionKey = `photo:${string}` | `presentation:${string}`;

export type LibrarySelectableItem = {
    asset: Asset;
    entityType: 'photo' | 'presentation';
    selectionKey: LibrarySelectionKey;
    photoId: string;
    presentationKey: string | null;
    assetIds: string[];
    stackCount: number;
    relationshipKind: LibraryPresentationRelationshipKind;
};

export type LibrarySelectionState = {
    selectedAssetIdsByKey: Map<LibrarySelectionKey, string[]>;
    anchorKey: LibrarySelectionKey | null;
    mostRecentSelectionKey: LibrarySelectionKey | null;
}

export type LibrarySelectionAction =
    | { mode: 'replace'; index: number }
    | { mode: 'toggle'; index: number }
    | { mode: 'range'; index: number }
    | { mode: 'select_all' };

export function createEmptyLibrarySelectionState(): LibrarySelectionState {
    return {
        selectedAssetIdsByKey: new Map(),
        anchorKey: null,
        mostRecentSelectionKey: null,
    };
}

export function getLibrarySelectionCount(selection: LibrarySelectionState): number {
    return selection.selectedAssetIdsByKey.size;
}

export function hasLibrarySelection(selection: LibrarySelectionState): boolean {
    return getLibrarySelectionCount(selection) > 0;
}

export function clearLibrarySelection(): LibrarySelectionState {
    return createEmptyLibrarySelectionState();
}

export function isItemSelected(selection: LibrarySelectionState, item: LibrarySelectableItem): boolean {
    return selection.selectedAssetIdsByKey.has(item.selectionKey);
}

export function getLibrarySelectionAssetIds(selection: LibrarySelectionState, _assets?: Asset[]): string[] {
    const assetIds = new Set<string>();
    for (const selectedIds of selection.selectedAssetIdsByKey.values()) {
        for (const assetId of selectedIds) {
            assetIds.add(assetId);
        }
    }
    return [...assetIds];
}

export function getLibrarySelectionPhotoIds(selection: LibrarySelectionState): string[] {
    return getLibrarySelectionAssetIds(selection);
}

export function getSelectionRangeKeys(keys: LibrarySelectionKey[], anchorKey: LibrarySelectionKey, targetKey: LibrarySelectionKey): LibrarySelectionKey[] {
    const startIndex = keys.indexOf(anchorKey);
    const endIndex = keys.indexOf(targetKey);
    if (startIndex === -1 || endIndex === -1) {
        return [targetKey];
    }

    const rangeStart = Math.min(startIndex, endIndex);
    const rangeEnd = Math.max(startIndex, endIndex);
    return keys.slice(rangeStart, rangeEnd + 1);
}

function addItemToSelection(selection: LibrarySelectionState, item: LibrarySelectableItem) {
    selection.selectedAssetIdsByKey.set(item.selectionKey, [...item.assetIds]);
}

function removeItemFromSelection(selection: LibrarySelectionState, item: LibrarySelectableItem) {
    selection.selectedAssetIdsByKey.delete(item.selectionKey);
}

function cloneLibrarySelection(selection: LibrarySelectionState): LibrarySelectionState {
    return {
        selectedAssetIdsByKey: new Map(
            [...selection.selectedAssetIdsByKey].map(([key, assetIds]) => [key, [...assetIds]]),
        ),
        anchorKey: selection.anchorKey,
        mostRecentSelectionKey: selection.mostRecentSelectionKey,
    };
}

function getItemAtIndex(items: LibrarySelectableItem[], index: number): LibrarySelectableItem | null {
    return items[index] ?? null;
}

function replaceLibrarySelection(items: LibrarySelectableItem[], index: number): LibrarySelectionState {
    const item = getItemAtIndex(items, index);
    if (!item) {
        return createEmptyLibrarySelectionState();
    }

    const nextSelection = createEmptyLibrarySelectionState();
    addItemToSelection(nextSelection, item);
    nextSelection.anchorKey = item.selectionKey;
    nextSelection.mostRecentSelectionKey = item.selectionKey;
    return nextSelection;
}

function toggleLibrarySelectionItem(items: LibrarySelectableItem[], selection: LibrarySelectionState, index: number): LibrarySelectionState {
    const item = getItemAtIndex(items, index);
    if (!item) {
        return selection;
    }

    const nextSelection = cloneLibrarySelection(selection);
    if (isItemSelected(nextSelection, item)) {
        removeItemFromSelection(nextSelection, item);
    } else {
        addItemToSelection(nextSelection, item);
    }
    nextSelection.anchorKey = item.selectionKey;
    nextSelection.mostRecentSelectionKey = item.selectionKey;
    return nextSelection;
}

function rangeSelectLibraryItems(items: LibrarySelectableItem[], selection: LibrarySelectionState, index: number): LibrarySelectionState {
    const item = getItemAtIndex(items, index);
    if (!item) {
        return selection;
    }

    if (!selection.anchorKey) {
        return replaceLibrarySelection(items, index);
    }

    const nextSelection = cloneLibrarySelection(selection);
    const selectionKeys = items.map((currentItem) => currentItem.selectionKey);
    for (const key of getSelectionRangeKeys(selectionKeys, selection.anchorKey, item.selectionKey)) {
        const rangedItem = items.find((currentItem) => currentItem.selectionKey === key);
        if (rangedItem) {
            addItemToSelection(nextSelection, rangedItem);
        }
    }
    nextSelection.mostRecentSelectionKey = item.selectionKey;
    return nextSelection;
}

export function updateLibrarySelection(
    items: LibrarySelectableItem[],
    selection: LibrarySelectionState,
    action: LibrarySelectionAction,
): LibrarySelectionState {
    if (action.mode === 'select_all') {
        const nextSelection = createEmptyLibrarySelectionState();
        for (const item of items) {
            addItemToSelection(nextSelection, item);
        }
        nextSelection.anchorKey = items[0]?.selectionKey ?? null;
        nextSelection.mostRecentSelectionKey = items.at(-1)?.selectionKey ?? null;
        return nextSelection;
    }

    if (action.mode === 'replace') {
        return replaceLibrarySelection(items, action.index);
    }

    if (action.mode === 'toggle') {
        return toggleLibrarySelectionItem(items, selection, action.index);
    }

    return rangeSelectLibraryItems(items, selection, action.index);
}
