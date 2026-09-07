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
