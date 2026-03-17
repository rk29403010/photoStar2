import type { Asset } from '@contracts/core';

type GroupedAsset = Asset & { role?: string | null };

export function isCanonicalGroupMember(asset: Asset): boolean {
    const groupedAsset = asset as GroupedAsset;
    return asset.group_role === 'canonical' || groupedAsset.role === 'canonical';
}

export function canSelectAsStar(asset: Asset): boolean {
    return Boolean(asset.group_id) && !isCanonicalGroupMember(asset);
}

export function canExplodeGroup(asset: Asset): boolean {
    return Boolean(asset.group_id);
}

export function getSelectAsStarLabel(): string {
    return 'Select as ⭐';
}

export function getExplodeGroupLabel(): string {
    return 'Explode Group';
}
