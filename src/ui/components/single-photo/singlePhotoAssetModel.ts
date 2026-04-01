import type { Asset } from '@contracts/core';
import { mergeAssetDetail } from '../../hooks/assetDetailMerge.ts';

type GroupedAsset = Asset & {
    role?: string | null;
    rank?: number | null;
};

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

    return Boolean(
        hasMeaningfulProjectionScalars(asset)
        || hasMeaningfulProjectionLists(asset)
        || hasMeaningfulAuthenticityScore(asset)
        || hasMeaningfulEstimatedDate(asset)
        || hasMeaningfulQuality(asset),
    );
}

function mergeSinglePhotoAsset(existingAsset: Asset, nextAsset: Asset): Asset {
    const mergedAsset = mergeAssetDetail(existingAsset, nextAsset);
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

export function mergeSinglePhotoAssets(baseAssets: Asset[], orbitAssets: Asset[]): Asset[] {
    const mergedAssets = new Map<string, Asset>();

    for (const asset of baseAssets) {
        mergedAssets.set(asset.id, asset);
    }

    for (const asset of dedupeSinglePhotoAssets(orbitAssets)) {
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

export function resolveStarAssetId(assets: Asset[], fallbackAssetId: string): string {
    const starredAsset = assets.find((asset) => asset.group_role === 'canonical');
    return starredAsset?.id ?? fallbackAssetId;
}

export function replaceGroupRepresentative(assets: Asset[], groupId: string, replacementAsset: Asset): Asset[] {
    return assets.map((asset) => {
        const groupedAsset = asset as GroupedAsset;
        const nextRepresentative = replacementAsset as GroupedAsset;

        if (groupedAsset.group_id !== groupId || groupedAsset.group_role !== 'canonical') {
            return groupedAsset;
        }

        return {
            ...groupedAsset,
            ...nextRepresentative,
            group_id: groupId,
            group_role: 'canonical',
            role: 'canonical',
            rank: -1,
            stack_count: groupedAsset.stack_count ?? nextRepresentative.stack_count ?? null,
        };
    });
}

export function applyStarSelection(assets: Asset[], groupId: string, assetId: string): Asset[] {
    return assets.map((asset) => {
        const groupedAsset = asset as GroupedAsset;
        if (groupedAsset.group_id !== groupId) {return groupedAsset;}
        if (groupedAsset.id === assetId) {
            return { ...groupedAsset, group_role: 'canonical', role: 'canonical', rank: -1 };
        }
        if (groupedAsset.group_role === 'canonical' || groupedAsset.role === 'canonical') {
            return { ...groupedAsset, group_role: 'member', role: 'member' };
        }
        return groupedAsset;
    });
}

export function clearGroupMembership(assets: Asset[], groupId: string): Asset[] {
    return assets.map((asset) => {
        const groupedAsset = asset as GroupedAsset;
        if (groupedAsset.group_id !== groupId) {
            return groupedAsset;
        }

        return {
            ...groupedAsset,
            group_id: null,
            group_role: null,
            role: null,
            rank: null,
            stack_count: null,
        };
    });
}

export function applyActiveGroupContext(asset: Asset, activeGroupId: string | null): Asset {
    if (!activeGroupId) {
        return asset;
    }

    const activeMembership = asset.group_memberships?.find((membership) => membership.group_id === activeGroupId);
    if (!activeMembership) {
        return asset;
    }

    return {
        ...asset,
        group_id: activeMembership.group_id,
        group_role: activeMembership.group_role,
        stack_count: activeMembership.stack_count,
        role: activeMembership.role,
        rank: activeMembership.rank,
        match_evidence: activeMembership.match_evidence,
    };
}
