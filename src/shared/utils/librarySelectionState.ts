import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';

export type LibrarySelectionKey = `photo:${string}` | `group:${string}`;

export type LibraryDisplayAsset = Asset & {
    libraryPresentation?: LibraryPresentationItem | null;
};

export type LibrarySelectableItem = {
    asset: LibraryDisplayAsset;
    entityType: 'photo' | 'group';
    selectionKey: LibrarySelectionKey;
    photoId: string;
    groupId: string | null;
    presentation?: LibraryPresentationItem | null;
};

export type LibrarySelectedItem = {
    selectionKey: LibrarySelectionKey;
    kind: 'photo' | 'presentation';
    representativeAssetId: string;
    assetIds: string[];
};

export type LibrarySelectionState = {
    selectedItemsByKey: Map<LibrarySelectionKey, LibrarySelectedItem>;
    selectionSnapshot: readonly LibrarySelectableItem[] | null;
    selectionSnapshotIndices: ReadonlyMap<LibrarySelectionKey, number>;
    selectedRanges: { start: number; end: number }[];
    excludedKeys: Set<LibrarySelectionKey>;
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
        selectedItemsByKey: new Map(),
        selectionSnapshot: null,
        selectionSnapshotIndices: new Map(),
        selectedRanges: [],
        excludedKeys: new Set(),
        anchorKey: null,
        mostRecentSelectionKey: null,
    };
}

export function getLibrarySelectionCount(selection: LibrarySelectionState): number {
    const orderedRanges = [...selection.selectedRanges].sort((left, right) => left.start - right.start);
    let rangeCount = 0;
    let coveredEnd = -1;
    for (const range of orderedRanges) {
        rangeCount += Math.max(0, range.end - Math.max(range.start, coveredEnd + 1) + 1);
        coveredEnd = Math.max(coveredEnd, range.end);
    }
    return rangeCount + selection.selectedItemsByKey.size - selection.excludedKeys.size;
}

export function hasLibrarySelection(selection: LibrarySelectionState): boolean {
    return getLibrarySelectionCount(selection) > 0;
}

export function clearLibrarySelection(): LibrarySelectionState {
    return createEmptyLibrarySelectionState();
}

export function isItemSelected(selection: LibrarySelectionState, item: LibrarySelectableItem): boolean {
    if (selection.selectedItemsByKey.has(item.selectionKey)) { return true; }
    const index = selection.selectionSnapshotIndices.get(item.selectionKey) ?? -1;
    return index >= 0 && !selection.excludedKeys.has(item.selectionKey)
        && selection.selectedRanges.some((range) => index >= range.start && index <= range.end);
}

export function getLibrarySelectionPhotoIds(selection: LibrarySelectionState): string[] {
    return getSelectedItems(selection)
        .filter((item) => item.kind === 'photo')
        .map((item) => item.representativeAssetId);
}

export function getLibrarySelectionAssetIds(selection: LibrarySelectionState, _assets: Asset[]): string[] {
    const assetIds = new Set<string>();
    for (const item of selection.selectionSnapshot ?? []) {
        if (isItemSelected(selection, item)) {
            for (const assetId of toSelectedItem(item).assetIds) { assetIds.add(assetId); }
        }
    }
    for (const item of selection.selectedItemsByKey.values()) {
        for (const assetId of item.assetIds) { assetIds.add(assetId); }
    }
    return [...assetIds];
}

function getSelectedItems(selection: LibrarySelectionState): LibrarySelectedItem[] {
    const items = new Map(selection.selectedItemsByKey);
    for (const item of selection.selectionSnapshot ?? []) {
        if (isItemSelected(selection, item)) { items.set(item.selectionKey, toSelectedItem(item)); }
    }
    return [...items.values()];
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

function toSelectedItem(item: LibrarySelectableItem): LibrarySelectedItem {
    const isPresentation = item.entityType === 'group';
    const presentationAssetIds = item.presentation?.assetIds ?? [];
    return {
        selectionKey: item.selectionKey,
        kind: isPresentation ? 'presentation' : 'photo',
        representativeAssetId: item.photoId,
        assetIds: isPresentation && presentationAssetIds.length > 0
            ? [...presentationAssetIds]
            : [item.photoId],
    };
}

function addItemToSelection(selection: LibrarySelectionState, item: LibrarySelectableItem) {
    selection.selectedItemsByKey.set(item.selectionKey, toSelectedItem(item));
}

function removeItemFromSelection(selection: LibrarySelectionState, item: LibrarySelectableItem) {
    selection.selectedItemsByKey.delete(item.selectionKey);
}

function cloneLibrarySelection(selection: LibrarySelectionState): LibrarySelectionState {
    return {
        selectedItemsByKey: new Map(selection.selectedItemsByKey),
        selectionSnapshot: selection.selectionSnapshot,
        selectionSnapshotIndices: selection.selectionSnapshotIndices,
        selectedRanges: [...selection.selectedRanges],
        excludedKeys: new Set(selection.excludedKeys),
        anchorKey: selection.anchorKey,
        mostRecentSelectionKey: selection.mostRecentSelectionKey,
    };
}

export function addLibraryItemsToSelection(
    selection: LibrarySelectionState,
    items: readonly LibrarySelectableItem[],
): LibrarySelectionState {
    const nextSelection = cloneLibrarySelection(selection);
    for (const item of items) {
        addItemToSelection(nextSelection, item);
    }
    return nextSelection;
}

export function setLibraryItemsSelected(
    selection: LibrarySelectionState,
    items: readonly LibrarySelectableItem[],
    selected: boolean,
): LibrarySelectionState {
    const nextSelection = cloneLibrarySelection(selection);
    for (const item of items) {
        if (selected) {
            addItemToSelection(nextSelection, item);
        } else {
            removeItemFromSelection(nextSelection, item);
        }
    }
    return nextSelection;
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
        if (nextSelection.selectionSnapshot) {
            nextSelection.excludedKeys.add(item.selectionKey);
        } else {
            removeItemFromSelection(nextSelection, item);
        }
    } else {
        if (nextSelection.selectionSnapshot) {
            nextSelection.excludedKeys.delete(item.selectionKey);
        } else {
            addItemToSelection(nextSelection, item);
        }
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
    const anchorIndex = items.findIndex((currentItem) => currentItem.selectionKey === selection.anchorKey);
    if (anchorIndex === -1) {
        return replaceLibrarySelection(items, index);
    }
    const rangeStart = Math.min(anchorIndex, index), rangeEnd = Math.max(anchorIndex, index);
    if (items.length >= 1000) {
        nextSelection.selectionSnapshot = items;
        nextSelection.selectionSnapshotIndices = new Map(items.map((entry, entryIndex) => [entry.selectionKey, entryIndex]));
        nextSelection.selectedRanges = [...nextSelection.selectedRanges, { start: rangeStart, end: rangeEnd }];
        nextSelection.selectedItemsByKey.clear();
        nextSelection.excludedKeys = new Set();
        nextSelection.mostRecentSelectionKey = item.selectionKey;
        return nextSelection;
    }
    for (const rangedItem of items.slice(rangeStart, rangeEnd + 1)) {
        addItemToSelection(nextSelection, rangedItem);
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
        if (items.length >= 1000) {
            return { selectedItemsByKey: new Map(), selectionSnapshot: items, selectionSnapshotIndices: new Map(items.map((entry, entryIndex) => [entry.selectionKey, entryIndex])), selectedRanges: [{ start: 0, end: items.length - 1 }], excludedKeys: new Set(), anchorKey: items[0]?.selectionKey ?? null, mostRecentSelectionKey: items.at(-1)?.selectionKey ?? null };
        }
        const nextSelection = addLibraryItemsToSelection(createEmptyLibrarySelectionState(), items);
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
