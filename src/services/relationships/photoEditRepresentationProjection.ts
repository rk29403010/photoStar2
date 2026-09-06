import type Database from 'better-sqlite3';
import {
    ensureArchiveRepresentation,
    getArchiveRepresentationsForAsset,
    type ArchiveRepresentation,
    type ArchiveRepresentationKind,
} from './archiveRepresentationRepository';

const SOURCE_KIND_PRIORITY: Record<ArchiveRepresentationKind, number> = {
    derived_edit: 0,
    crop: 1,
    scan: 2,
    original: 3,
    extracted_frame: 4,
    reference: 5,
};

type ProjectPhotoEditRepresentationsInput = {
    sourceAssetId: string;
    renderedAssetId: string;
    editId: string;
};

function sourceKey(representation: ArchiveRepresentation): string {
    return `${representation.subjectEntityId}\n${representation.facet ?? ''}`;
}

function choosePhotographSources(representations: readonly ArchiveRepresentation[]): ArchiveRepresentation[] {
    const selected = new Map<string, ArchiveRepresentation>();
    const ordered = representations
        .filter((representation) => representation.subjectKind === 'photograph')
        .toSorted((left, right) => {
            const kindDifference = SOURCE_KIND_PRIORITY[left.representationKind]
                - SOURCE_KIND_PRIORITY[right.representationKind];
            return kindDifference || left.id.localeCompare(right.id);
        });
    for (const representation of ordered) {
        const key = sourceKey(representation);
        if (!selected.has(key)) {
            selected.set(key, representation);
        }
    }
    return [...selected.values()].toSorted((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
}

/**
 * Projects editor ancestry into archive semantics without changing editor truth.
 * A rendered edit represents the same logical Photograph as its source, but it
 * does not inherit an Artefact link because a digital restoration is not the
 * physical print, negative, album page, etc. that was scanned.
 */
export function projectPhotoEditRepresentations(
    db: Database.Database,
    input: ProjectPhotoEditRepresentationsInput,
): string[] {
    const sourceRepresentations = choosePhotographSources(
        getArchiveRepresentationsForAsset(db, input.sourceAssetId),
    );
    return sourceRepresentations.map((source) => ensureArchiveRepresentation(db, {
        assetId: input.renderedAssetId,
        subjectEntityId: source.subjectEntityId,
        representationKind: 'derived_edit',
        facet: source.facet,
        sourceKind: 'system',
        sourceRef: `photo-edit:${input.editId}`,
        derivedFromRepresentationId: source.id,
    }).id);
}
