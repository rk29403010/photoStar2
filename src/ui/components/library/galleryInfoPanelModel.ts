import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import {
    isItemSelected,
    type LibrarySelectableItem,
    type LibrarySelectionKey,
    type LibrarySelectionState,
} from '../../../shared/utils/librarySelectionState.ts';

export type GalleryInfoPanelAsset = Asset & {
    libraryPresentation?: LibraryPresentationItem | null;
};

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

function getSelectedInfoItem(
    items: LibrarySelectableItem[],
    selection: LibrarySelectionState,
): LibrarySelectableItem | null {
    return (
        getSelectedItemByKey(items, selection, selection.mostRecentSelectionKey)
        ?? getSelectedItemByKey(items, selection, selection.anchorKey)
        ?? getLastSelectedVisibleItem(items, selection)
        ?? null
    );
}

export function getGalleryInfoPanelAsset(
    items: LibrarySelectableItem[],
    selection: LibrarySelectionState,
): GalleryInfoPanelAsset | null {
    const selectedItem = getSelectedInfoItem(items, selection);
    if (!selectedItem) {
        return null;
    }
    if (!selectedItem.presentation) {
        return selectedItem.asset;
    }
    return {
        ...selectedItem.asset,
        libraryPresentation: selectedItem.presentation,
    };
}
