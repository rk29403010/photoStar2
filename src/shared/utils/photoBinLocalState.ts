type AssetLike = {
    id: string;
};

export function removeAssetsById<TAsset extends AssetLike>(assets: TAsset[], assetIds: string[]): TAsset[] {
    if (assetIds.length === 0) {
        return assets;
    }

    const removedIds = new Set(assetIds);
    return assets.filter((asset) => !removedIds.has(asset.id));
}

function appendUniqueAsset<TAsset extends AssetLike>(
    nextAssetsById: Map<string, TAsset>,
    orderedAssets: TAsset[],
    appendedIds: Set<string>,
    assetId: string,
) {
    const nextAsset = nextAssetsById.get(assetId);
    if (!nextAsset || appendedIds.has(nextAsset.id)) {
        return;
    }

    orderedAssets.push(nextAsset);
    appendedIds.add(nextAsset.id);
}

function appendAssetsInOrder<TAsset extends AssetLike>(
    assets: TAsset[],
    nextAssetsById: Map<string, TAsset>,
    orderedAssets: TAsset[],
    appendedIds: Set<string>,
) {
    for (const asset of assets) {
        appendUniqueAsset(nextAssetsById, orderedAssets, appendedIds, asset.id);
    }
}

export function restoreAssetsByReference<TAsset extends AssetLike>(
    currentAssets: TAsset[],
    restoredAssets: TAsset[],
    referenceAssets: TAsset[],
): TAsset[] {
    if (restoredAssets.length === 0) {
        return currentAssets;
    }

    const nextAssetsById = new Map<string, TAsset>();
    for (const asset of currentAssets) {
        nextAssetsById.set(asset.id, asset);
    }
    for (const asset of restoredAssets) {
        nextAssetsById.set(asset.id, asset);
    }

    const orderedAssets: TAsset[] = [];
    const appendedIds = new Set<string>();
    appendAssetsInOrder(referenceAssets, nextAssetsById, orderedAssets, appendedIds);
    appendAssetsInOrder(currentAssets, nextAssetsById, orderedAssets, appendedIds);
    appendAssetsInOrder(restoredAssets, nextAssetsById, orderedAssets, appendedIds);

    return orderedAssets;
}
