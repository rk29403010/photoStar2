import type { Asset } from '@contracts/core';
import { getLibraryBinActionLabel as getSharedLibraryBinActionLabel } from '../app/libraryBinActionModel.ts';

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

export function getLibraryBinActionLabel(action: 'move_to_bin' | 'restore'): string {
    return getSharedLibraryBinActionLabel(action);
}
