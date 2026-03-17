import type { Asset } from '@contracts/core';

export type LibrarySelectionKey = `photo:${string}` | `group:${string}`;

export type LibrarySelectableItem = {
    asset: Asset;
    entityType: 'photo' | 'group';
    selectionKey: LibrarySelectionKey;
    photoId: string;
    groupId: string | null;
};

export interface LibrarySelectionState {
    photoIds: Set<string>;
    groupIds: Set<string>;
    anchorKey: LibrarySelectionKey | null;
}

export type LibrarySelectionAction =
    | { mode: 'replace'; index: number }
    | { mode: 'toggle'; index: number }
    | { mode: 'range'; index: number }
    | { mode: 'select_all' };

export function createEmptyLibrarySelectionState(): LibrarySelectionState {
    return {
        photoIds: new Set(),
        groupIds: new Set(),
        anchorKey: null,
    };
}

export function getLibrarySelectionCount(selection: LibrarySelectionState): number {
    return selection.photoIds.size + selection.groupIds.size;
}

export function hasLibrarySelection(selection: LibrarySelectionState): boolean {
    return getLibrarySelectionCount(selection) > 0;
}

export function clearLibrarySelection(): LibrarySelectionState {
    return createEmptyLibrarySelectionState();
}

export function isItemSelected(selection: LibrarySelectionState, item: LibrarySelectableItem): boolean {
    return item.entityType === 'group'
        ? selection.groupIds.has(item.groupId ?? '')
        : selection.photoIds.has(item.photoId);
}

export function getLibrarySelectionPhotoIds(selection: LibrarySelectionState): string[] {
    return [...selection.photoIds];
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
    if (item.entityType === 'group' && item.groupId) {
        selection.groupIds.add(item.groupId);
        return;
    }

    selection.photoIds.add(item.photoId);
}

function removeItemFromSelection(selection: LibrarySelectionState, item: LibrarySelectableItem) {
    if (item.entityType === 'group' && item.groupId) {
        selection.groupIds.delete(item.groupId);
        return;
    }

    selection.photoIds.delete(item.photoId);
}

function cloneLibrarySelection(selection: LibrarySelectionState): LibrarySelectionState {
    return {
        photoIds: new Set(selection.photoIds),
        groupIds: new Set(selection.groupIds),
        anchorKey: selection.anchorKey,
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
