import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import { sortAssetsForGallery, type LibrarySortMode } from './libraryGallery';
import type { LibrarySelectableItem } from './librarySelectionState';

type BuildVisibleGalleryItemsOptions = {
    declusteredAssetIds?: Set<string>;
    groupSimilarPhotos: boolean;
    sortMode: LibrarySortMode;
    presentationItems?: LibraryPresentationItem[];
};

function sortAssetsWithDeclusteredTrailing(
    assets: Asset[],
    declusteredAssetIds: Set<string> | undefined,
    sortMode: LibrarySortMode,
) {
    if (!declusteredAssetIds || declusteredAssetIds.size === 0) {
        return sortAssetsForGallery(assets, sortMode);
    }

    const primaryAssets = assets.filter((asset) => !declusteredAssetIds.has(asset.id));
    const trailingAssets = assets.filter((asset) => declusteredAssetIds.has(asset.id));
    return [
        ...sortAssetsForGallery(primaryAssets, sortMode),
        ...sortAssetsForGallery(trailingAssets, sortMode),
    ];
}

function sortPresentationItemsWithDeclusteredTrailing(
    items: LibraryPresentationItem[],
    declusteredAssetIds: Set<string> | undefined,
) {
    if (!declusteredAssetIds || declusteredAssetIds.size === 0) {
        return items;
    }

    const primaryItems: LibraryPresentationItem[] = [];
    const trailingItems: LibraryPresentationItem[] = [];
    for (const item of items) {
        if (declusteredAssetIds.has(item.representativeAssetId)) {
            trailingItems.push(item);
        } else {
            primaryItems.push(item);
        }
    }
    return [...primaryItems, ...trailingItems];
}

function shouldShowAssetInGroupedMode(asset: Asset) {
    return !asset.group_id || asset.group_role === 'canonical';
}

function dedupeGroupedVisibleAssets(assets: Asset[]): Asset[] {
    const seenGroupIds = new Set<string>();

    return assets.filter((asset) => {
        if (!asset.group_id) {
            return true;
        }

        if (seenGroupIds.has(asset.group_id)) {
            return false;
        }

        seenGroupIds.add(asset.group_id);
        return true;
    });
}

function toLegacyLibrarySelectableItem(asset: Asset, groupSimilarPhotos: boolean): LibrarySelectableItem {
    if (groupSimilarPhotos && asset.group_id && asset.group_role === 'canonical') {
        return {
            asset,
            entityType: 'group',
            selectionKey: `group:${asset.group_id}`,
            photoId: asset.id,
            groupId: asset.group_id,
        };
    }

    return {
        asset,
        entityType: 'photo',
        selectionKey: `photo:${asset.id}`,
        photoId: asset.id,
        groupId: asset.group_id ?? null,
    };
}

function toPresentationSelectableItem(
    item: LibraryPresentationItem,
    asset: Asset,
): LibrarySelectableItem {
    if (item.stackCount > 1) {
        return {
            asset: { ...asset, stack_count: item.stackCount },
            entityType: 'group',
            selectionKey: `group:${item.presentationKey}`,
            photoId: item.representativeAssetId,
            groupId: item.presentationKey,
        };
    }

    return {
        asset,
        entityType: 'photo',
        selectionKey: `photo:${item.representativeAssetId}`,
        photoId: item.representativeAssetId,
        groupId: null,
    };
}

function buildPresentationSelectableItems(
    assets: Asset[],
    presentationItems: LibraryPresentationItem[],
    declusteredAssetIds: Set<string> | undefined,
): LibrarySelectableItem[] {
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const orderedItems = sortPresentationItemsWithDeclusteredTrailing(presentationItems, declusteredAssetIds);
    return orderedItems.flatMap((item) => {
        const representative = assetById.get(item.representativeAssetId);
        return representative ? [toPresentationSelectableItem(item, representative)] : [];
    });
}

export function buildVisibleGalleryItems(
    assets: Asset[],
    options: BuildVisibleGalleryItemsOptions,
): LibrarySelectableItem[] {
    if (options.groupSimilarPhotos && options.presentationItems) {
        return buildPresentationSelectableItems(
            assets,
            options.presentationItems,
            options.declusteredAssetIds,
        );
    }

    const sortedAssets = sortAssetsWithDeclusteredTrailing(assets, options.declusteredAssetIds, options.sortMode);
    const visibleAssets = options.groupSimilarPhotos
        ? dedupeGroupedVisibleAssets(sortedAssets.filter(shouldShowAssetInGroupedMode))
        : sortedAssets;

    return visibleAssets.map((asset) => toLegacyLibrarySelectableItem(asset, options.groupSimilarPhotos));
}
