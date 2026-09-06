import type Database from 'better-sqlite3';
import type {
    ArchiveLineage,
    ArchiveLineageRepresentation,
    ArchiveLineageSubject,
    ArchiveLineageSubjectKind,
} from '../../boundary/contracts/archiveLineage';
import {
    getArchiveRepresentationsForAsset,
    getArchiveRepresentationsForSubject,
    type ArchiveRepresentation,
} from './archiveRepresentationRepository';

type EntityLabelRow = {
    id: string;
    label: string | null;
};

function subjectKindRank(kind: ArchiveLineageSubjectKind): number {
    return kind === 'photograph' ? 0 : 1;
}

function toLineageRepresentation(
    representation: ArchiveRepresentation,
    assetId: string,
): ArchiveLineageRepresentation {
    return {
        id: representation.id,
        currentAssetId: representation.currentAssetId,
        originalPath: representation.originalPath,
        representationKind: representation.representationKind,
        facet: representation.facet,
        sourceKind: representation.sourceKind,
        sourceRef: representation.sourceRef,
        derivedFromRepresentationId: representation.derivedFromRepresentationId,
        isCurrentAsset: representation.currentAssetId === assetId,
    };
}

function loadEntityLabels(db: Database.Database, entityIds: readonly string[]): Map<string, string | null> {
    if (entityIds.length === 0) {
        return new Map();
    }
    const placeholders = entityIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT id, label
        FROM semantic_entities
        WHERE id IN (${placeholders})
    `).all(...entityIds) as EntityLabelRow[];
    return new Map(rows.map((row) => [row.id, row.label]));
}

function buildSubject(
    db: Database.Database,
    assetId: string,
    subjectEntityId: string,
    kind: ArchiveLineageSubjectKind,
    label: string | null,
): ArchiveLineageSubject {
    const representations = getArchiveRepresentationsForSubject(db, subjectEntityId)
        .map((representation) => toLineageRepresentation(representation, assetId));
    return {
        entityId: subjectEntityId,
        kind,
        label,
        representations,
    };
}

/**
 * Builds the small, presentation-safe relationship neighbourhood needed by the
 * Single Photo lineage UI. This is intentionally not a generic semantic graph
 * traversal API: it starts from one managed asset and expands only the logical
 * Photograph / physical Artefact subjects that the asset already represents.
 */
export function buildArchiveLineageForAsset(
    db: Database.Database,
    assetId: string,
): ArchiveLineage {
    const currentRepresentations = getArchiveRepresentationsForAsset(db, assetId);
    const subjectsById = new Map<string, ArchiveLineageSubjectKind>();
    for (const representation of currentRepresentations) {
        subjectsById.set(representation.subjectEntityId, representation.subjectKind);
    }

    const subjectIds = [...subjectsById.keys()];
    const labels = loadEntityLabels(db, subjectIds);
    const subjects = subjectIds.map((subjectEntityId) => buildSubject(
        db,
        assetId,
        subjectEntityId,
        subjectsById.get(subjectEntityId)!,
        labels.get(subjectEntityId) ?? null,
    ));
    subjects.sort((left, right) => {
        const kindDifference = subjectKindRank(left.kind) - subjectKindRank(right.kind);
        if (kindDifference !== 0) {
            return kindDifference;
        }
        return (left.label ?? left.entityId).localeCompare(right.label ?? right.entityId);
    });

    return { assetId, subjects };
}
