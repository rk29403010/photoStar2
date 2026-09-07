import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import { getLibraryBinActionLabel as getSharedLibraryBinActionLabel } from '../app/libraryBinActionModel.ts';

type GroupedAsset = Asset & { role?: string | null };

const STAR_LABELS = ['Select as ⭐', 'Make Star'] as const;
const SEPARATE_LABELS = ['Explode Group', 'Show Separately'] as const;

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
    return STAR_LABELS[Number(isPresentation)] ?? STAR_LABELS[0];
}

export function getRelationshipSeparateLabel(isPresentation: boolean): string {
    return SEPARATE_LABELS[Number(isPresentation)] ?? SEPARATE_LABELS[0];
}

export function getSelectAsStarLabel(): string {
    return STAR_LABELS[0];
}

export function getExplodeGroupLabel(): string {
    return SEPARATE_LABELS[0];
}

export function getLibraryBinActionLabel(action: 'move_to_bin' | 'restore'): string {
    return getSharedLibraryBinActionLabel(action);
}
