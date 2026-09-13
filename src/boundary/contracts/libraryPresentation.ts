import type { Asset } from './core';

export type LibraryPresentationRelationshipKind =
    | 'edit_lineage'
    | 'exact_copy'
    | 'near_duplicate'
    | 'variant'
    | 'capture_sequence'
    | null;

export type LibraryPresentationItem = {
    presentationKey: string;
    representativeAssetId: string;
    relationshipKind: LibraryPresentationRelationshipKind;
    stackCount: number;
    assetIds: string[];
    momentCount: number;
};

export type LibraryPresentationExpansionItem = {
    asset: Asset;
    ordinal: number;
    isRepresentative: boolean;
};

export type LibraryPresentationExpansion = {
    presentationKey: string;
    relationshipKind: LibraryPresentationRelationshipKind;
    representativeAssetId: string;
    stackCount: number;
    momentCount: number;
    items: LibraryPresentationExpansionItem[];
};
