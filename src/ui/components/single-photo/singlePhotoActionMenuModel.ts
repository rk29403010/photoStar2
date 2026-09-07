import type { Asset } from '@contracts/core';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import { getLibraryBinActionLabel as getSharedLibraryBinActionLabel } from '../app/libraryBinActionModel.ts';

const STAR_LABELS = ['Select as ⭐', 'Make Star'] as const;
const SEPARATE_LABELS = ['Explode Group', 'Show Separately'] as const;

export type RelationshipMenuState = {
    relationshipId: string | null;
    isPresentation: boolean;
    showMakeStar: boolean;
    showSeparate: boolean;
};

export function resolveRelationshipMenuState(params: {
    asset: Asset;
    presentation: LibraryPresentationItem | null;
    canSetRepresentative: boolean;
    canSeparate: boolean;
}): RelationshipMenuState {
    const { asset, presentation, canSetRepresentative, canSeparate } = params;
    const relationshipId = presentation?.presentationKey ?? null;
    const isPresentationRepresentative = presentation?.representativeAssetId === asset.id;

    return {
        relationshipId,
        isPresentation: presentation !== null,
        showMakeStar: Boolean(relationshipId) && canSetRepresentative && !isPresentationRepresentative,
        showSeparate: Boolean(relationshipId) && canSeparate,
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
