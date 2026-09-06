export type ArchiveLineageSubjectKind = 'photograph' | 'artefact';

export type ArchiveLineageRepresentationKind =
    | 'original'
    | 'scan'
    | 'crop'
    | 'derived_edit'
    | 'extracted_frame'
    | 'reference';

export type ArchiveLineageRepresentation = {
    id: string;
    currentAssetId: string | null;
    originalPath: string;
    representationKind: ArchiveLineageRepresentationKind;
    facet: string | null;
    sourceKind: 'system' | 'human' | 'import';
    sourceRef: string | null;
    derivedFromRepresentationId: string | null;
    isCurrentAsset: boolean;
};

export type ArchiveLineageSubject = {
    entityId: string;
    kind: ArchiveLineageSubjectKind;
    label: string | null;
    representations: ArchiveLineageRepresentation[];
};

export type ArchiveLineage = {
    assetId: string;
    subjects: ArchiveLineageSubject[];
};
