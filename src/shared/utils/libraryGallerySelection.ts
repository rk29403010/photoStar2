import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import { sortAssetsForGallery, type LibrarySortMode } from './libraryGallery.ts';
import type { LibrarySelectableItem } from './librarySelectionState.ts';

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

function toPhotoSelectableItem(asset: Asset): LibrarySelectableItem {
    return {
        asset,
        entityType: 'photo',
        selectionKey: `photo:${asset.id}`,
        photoId: asset.id,
        groupId: null,
        presentation: null,
    };
}

function toPresentationSelectableItem(
    item: LibraryPresentationItem,
    asset: Asset,
): LibrarySelectableItem {
    const displayAsset = { ...asset, libraryPresentation: item };
    if (item.stackCount > 1) {
        return {
            asset: displayAsset,
            entityType: 'group',
            selectionKey: `group:${item.presentationKey}`,
            photoId: item.representativeAssetId,
            groupId: item.presentationKey,
            presentation: item,
        };
    }

    return {
        asset: displayAsset,
        entityType: 'photo',
        selectionKey: `photo:${item.representativeAssetId}`,
        photoId: item.representativeAssetId,
        groupId: null,
        presentation: item,
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
    if (options.groupSimilarPhotos && options.presentationItems?.length) {
        return buildPresentationSelectableItems(
            assets,
            options.presentationItems,
            options.declusteredAssetIds,
        );
    }

    return sortAssetsWithDeclusteredTrailing(
        assets,
        options.declusteredAssetIds,
        options.sortMode,
    ).map(toPhotoSelectableItem);
}
