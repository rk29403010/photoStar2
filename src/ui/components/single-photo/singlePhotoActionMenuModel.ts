import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import { getLibraryBinActionLabel as getSharedLibraryBinActionLabel } from '../app/libraryBinActionModel.ts';

type GroupedAsset = Asset & { role?: string | null };

export type RelationshipMenuState = {
    relationshipId: string | null;
    isPresentation: boolean;
    showMakeStar: boolean;
    showSeparate: boolean;
};

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

export function resolveRelationshipMenuState(params: {
    asset: Asset;
    presentation: LibraryPresentationItem | null;
    canSetRepresentative: boolean;
    canSeparate: boolean;
}): RelationshipMenuState {
    const { asset, presentation, canSetRepresentative, canSeparate } = params;
    const isPresentation = presentation !== null;
    const relationshipId = presentation?.presentationKey ?? asset.group_id ?? null;
    const isPresentationRepresentative = presentation?.representativeAssetId === asset.id;
    const showMakeStar = Boolean(relationshipId)
        && canSetRepresentative
        && (isPresentation ? !isPresentationRepresentative : canSelectAsStar(asset));
    const showSeparate = Boolean(relationshipId)
        && canSeparate
        && (isPresentation || canExplodeGroup(asset));

    return {
        relationshipId,
        isPresentation,
        showMakeStar,
        showSeparate,
    };
}

export function getRelationshipStarLabel(isPresentation: boolean): string {
    return isPresentation ? 'Make Star' : getSelectAsStarLabel();
}

export function getRelationshipSeparateLabel(isPresentation: boolean): string {
    return isPresentation ? 'Show Separately' : getExplodeGroupLabel();
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
