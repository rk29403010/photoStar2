import type { Asset } from '@contracts/core';
import { sortAssetsForGallery, type LibrarySortMode } from './libraryGallery';
import type { LibrarySelectableItem } from './librarySelectionState';

type BuildVisibleGalleryItemsOptions = {
    declusteredAssetIds?: Set<string>;
    groupSimilarPhotos: boolean;
    sortMode: LibrarySortMode;
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

function toLibrarySelectableItem(asset: Asset, groupSimilarPhotos: boolean): LibrarySelectableItem {
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

export function buildVisibleGalleryItems(
    assets: Asset[],
    options: BuildVisibleGalleryItemsOptions,
): LibrarySelectableItem[] {
    const sortedAssets = sortAssetsWithDeclusteredTrailing(assets, options.declusteredAssetIds, options.sortMode);
    const visibleAssets = options.groupSimilarPhotos
        ? dedupeGroupedVisibleAssets(sortedAssets.filter(shouldShowAssetInGroupedMode))
        : sortedAssets;

    return visibleAssets.map((asset) => toLibrarySelectableItem(asset, options.groupSimilarPhotos));
}
