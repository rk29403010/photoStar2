import type { Asset } from '@contracts/core';
import {
    isItemSelected,
    type LibrarySelectableItem,
    type LibrarySelectionKey,
    type LibrarySelectionState,
} from '../../../shared/utils/librarySelectionState.ts';

function getSelectedItemByKey(
    items: LibrarySelectableItem[],
    selection: LibrarySelectionState,
    selectionKey: LibrarySelectionKey | null,
): LibrarySelectableItem | null {
    if (!selectionKey) {
        return null;
    }

    const item = items.find((candidate) => candidate.selectionKey === selectionKey) ?? null;
    return item && isItemSelected(selection, item) ? item : null;
}

function getLastSelectedVisibleItem(items: LibrarySelectableItem[], selection: LibrarySelectionState): LibrarySelectableItem | null {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (item && isItemSelected(selection, item)) {
            return item;
        }
    }

    return null;
}

export function getGalleryInfoPanelAsset(items: LibrarySelectableItem[], selection: LibrarySelectionState): Asset | null {
    return (
        getSelectedItemByKey(items, selection, selection.mostRecentSelectionKey)?.asset
        ?? getSelectedItemByKey(items, selection, selection.anchorKey)?.asset
        ?? getLastSelectedVisibleItem(items, selection)?.asset
        ?? null
    );
}
