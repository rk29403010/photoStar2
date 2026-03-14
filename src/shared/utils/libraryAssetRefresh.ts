type AssetLike = {
    id: string;
};

export function mergeRefreshedAssetPage<TAsset extends AssetLike>(
    existingAssets: TAsset[],
    refreshedAssets: TAsset[],
): TAsset[] {
    if (existingAssets.length === 0) {
        return refreshedAssets;
    }

    const refreshedIds = new Set(refreshedAssets.map((asset) => asset.id));
    const preservedTail = existingAssets.filter((asset) => !refreshedIds.has(asset.id));
    return [...refreshedAssets, ...preservedTail];
}
