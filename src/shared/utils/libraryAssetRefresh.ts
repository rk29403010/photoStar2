type AssetLike = {
    id: string;
};

export function mergeRefreshedAssetPage<TAsset extends AssetLike>(
    existingAssets: TAsset[],
    refreshedAssets: TAsset[],
    options?: {
        replaceWindowSize?: number;
    },
): TAsset[] {
    if (existingAssets.length === 0) {
        return refreshedAssets;
    }

    const refreshedIds = new Set(refreshedAssets.map((asset) => asset.id));
    const preservedTail = typeof options?.replaceWindowSize === 'number'
        ? existingAssets
            .slice(Math.max(options.replaceWindowSize, refreshedAssets.length))
            .filter((asset) => !refreshedIds.has(asset.id))
        : existingAssets.filter((asset) => !refreshedIds.has(asset.id));
    return [...refreshedAssets, ...preservedTail];
}
