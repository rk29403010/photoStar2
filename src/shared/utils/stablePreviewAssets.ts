type AssetWithPreview = {
    id: string;
    preview_path?: string | null;
};

function filterPreviewAssets<TAsset extends AssetWithPreview>(assets: TAsset[]): TAsset[] {
    return assets.filter((asset) => Boolean(asset.preview_path));
}

function hasOverlap<TAsset extends AssetWithPreview>(previousAssets: TAsset[], incomingAssets: TAsset[]) {
    if (previousAssets.length === 0 || incomingAssets.length === 0) {
        return false;
    }

    const incomingIds = new Set(incomingAssets.map((asset) => asset.id));
    return previousAssets.some((asset) => incomingIds.has(asset.id));
}

export function buildStablePreviewAssets<TAsset extends AssetWithPreview>(
    previousVisibleAssets: TAsset[],
    incomingAssets: TAsset[],
    ingestActive: boolean,
): TAsset[] {
    const incomingVisibleAssets = filterPreviewAssets(incomingAssets);
    if (!ingestActive) {
        return incomingVisibleAssets;
    }

    if (!hasOverlap(previousVisibleAssets, incomingAssets)) {
        return incomingVisibleAssets;
    }

    const incomingById = new Map(incomingVisibleAssets.map((asset) => [asset.id, asset]));
    const nextVisibleAssets = previousVisibleAssets.map((asset) => incomingById.get(asset.id) ?? asset);
    const seenIds = new Set(nextVisibleAssets.map((asset) => asset.id));

    for (const asset of incomingVisibleAssets) {
        if (seenIds.has(asset.id)) {
            continue;
        }
        nextVisibleAssets.push(asset);
        seenIds.add(asset.id);
    }

    return nextVisibleAssets;
}
