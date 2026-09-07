import type { Asset } from '@contracts/core';
import { mergeAssetDetail } from '../../hooks/assetDetailMerge.ts';

function hasMeaningfulQuality(asset: Asset): boolean {
    const quality = asset.photo_metadata?.projection.quality;
    return Boolean(
        quality
        && (quality.technical !== null
            || quality.lighting !== null
            || quality.composition !== null
            || quality.emotional !== null
            || quality.discard === true),
    );
}

function hasMeaningfulEstimatedDate(asset: Asset): boolean {
    const estimatedDate = asset.photo_metadata?.projection.estimatedDate;
    return Boolean(
        estimatedDate
        && (
            estimatedDate.most_likely_date
            || estimatedDate.min_date
            || estimatedDate.max_date
            || estimatedDate.display_label
            || estimatedDate.rationale
        ),
    );
}

function hasMeaningfulProjectionScalars(asset: Asset): boolean {
    const projection = asset.photo_metadata?.projection;
    return Boolean(
        projection
        && (
            projection.type
            || projection.caption
            || projection.description
            || projection.location
            || projection.emotionalImpact
        ),
    );
}

function hasMeaningfulProjectionLists(asset: Asset): boolean {
    const projection = asset.photo_metadata?.projection;
    return Boolean(
        projection
        && (
            projection.keywords.length > 0
            || projection.recommendedEnhancements.length > 0
            || projection.authenticity.reasons.length > 0
            || projection.subjects.length > 0
            || projection.regionsOfInterest.length > 0
        ),
    );
}

function hasMeaningfulAuthenticityScore(asset: Asset): boolean {
    return asset.photo_metadata?.projection.authenticity.score !== null;
}

function hasMeaningfulPhotoMetadata(asset: Asset): boolean {
    const projection = asset.photo_metadata?.projection;
    if (!projection) {
        return false;
    }

    return hasMeaningfulProjectionScalars(asset)
        || hasMeaningfulProjectionLists(asset)
        || hasMeaningfulAuthenticityScore(asset)
        || hasMeaningfulEstimatedDate(asset)
        || hasMeaningfulQuality(asset);
}

function mergeSinglePhotoAsset(existingAsset: Asset, nextAsset: Asset): Asset {
    const mergedAsset = mergeAssetDetail(nextAsset, existingAsset);
    if (hasMeaningfulPhotoMetadata(nextAsset) || !existingAsset.photo_metadata) {
        return mergedAsset;
    }

    return {
        ...mergedAsset,
        photo_metadata: existingAsset.photo_metadata,
    };
}

export function dedupeSinglePhotoAssets(assets: Asset[]): Asset[] {
    const dedupedAssets = new Map<string, Asset>();

    for (const asset of assets) {
        const existingAsset = dedupedAssets.get(asset.id);
        dedupedAssets.set(asset.id, existingAsset ? { ...existingAsset, ...asset } : asset);
    }

    return Array.from(dedupedAssets.values());
}

export function mergeSinglePhotoAssets(baseAssets: Asset[], expandedAssets: Asset[]): Asset[] {
    const mergedAssets = new Map<string, Asset>();

    for (const asset of baseAssets) {
        mergedAssets.set(asset.id, asset);
    }

    for (const asset of dedupeSinglePhotoAssets(expandedAssets)) {
        const existingAsset = mergedAssets.get(asset.id);
        mergedAssets.set(asset.id, existingAsset ? mergeSinglePhotoAsset(existingAsset, asset) : asset);
    }

    return Array.from(mergedAssets.values());
}

export function resolveSinglePhotoAssetIndex(assets: Asset[], assetId: string): number {
    return assets.findIndex((asset) => asset.id === assetId);
}

export function isLibrarySelectionAnchorAsset(assets: Asset[], assetId: string | undefined): boolean {
    return Boolean(assetId) && assets.some((asset) => asset.id === assetId);
}
