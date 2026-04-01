import type { Asset } from '@contracts/core';

function mergePhotoMetadata(existingAsset: Asset, nextAsset: Asset) {
    if (!nextAsset.photo_metadata) {
        return existingAsset.photo_metadata;
    }

    return {
        ...nextAsset.photo_metadata,
        evidence: nextAsset.photo_metadata.evidence ?? existingAsset.photo_metadata?.evidence,
    };
}

export function mergeAssetDetail(existingAsset: Asset, nextAsset: Asset): Asset {
    return {
        ...existingAsset,
        ...nextAsset,
        photo_metadata: mergePhotoMetadata(existingAsset, nextAsset),
        ai_metadata: nextAsset.ai_metadata ?? existingAsset.ai_metadata,
        embedded_metadata: nextAsset.embedded_metadata ?? existingAsset.embedded_metadata,
        photo_date_estimate: nextAsset.photo_date_estimate ?? existingAsset.photo_date_estimate,
    };
}
