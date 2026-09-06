import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type ArchiveRepresentationKind =
    | 'original'
    | 'scan'
    | 'crop'
    | 'derived_edit'
    | 'extracted_frame'
    | 'reference';

export type ArchiveRepresentationSourceKind = 'system' | 'human' | 'import';

export type ArchiveRepresentation = {
    id: string;
    assetId: string;
    subjectEntityId: string;
    subjectKind: 'photograph' | 'artefact';
    representationKind: ArchiveRepresentationKind;
    facet: string | null;
    sourceKind: ArchiveRepresentationSourceKind;
    sourceRef: string | null;
    derivedFromRepresentationId: string | null;
    createdAt: string;
};

export type EnsureArchiveRepresentationInput = {
    assetId: string;
    subjectEntityId: string;
    representationKind: ArchiveRepresentationKind;
    facet?: string | null;
    sourceKind: ArchiveRepresentationSourceKind;
    sourceRef?: string | null;
    derivedFromRepresentationId?: string | null;
};

type RepresentationRow = {
    id: string;
    asset_id: string;
    subject_entity_id: string;
    subject_kind: 'photograph' | 'artefact';
    representation_kind: ArchiveRepresentationKind;
    facet: string | null;
    source_kind: ArchiveRepresentationSourceKind;
    source_ref: string | null;
    derived_from_representation_id: string | null;
    created_at: string;
};

function representationId(input: EnsureArchiveRepresentationInput): string {
    const digest = createHash('sha256')
        .update(input.assetId)
        .update('\n')
        .update(input.subjectEntityId)
        .update('\n')
        .update(input.representationKind)
        .update('\n')
        .update(input.facet ?? '')
        .digest('hex');
    return `representation:${digest}`;
}

function assertAssetExists(db: DbHandle, assetId: string): void {
    const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
        throw new Error(`Unknown representation asset '${assetId}'.`);
    }
}

function loadSubjectKind(db: DbHandle, subjectEntityId: string): 'photograph' | 'artefact' {
    const entity = db.prepare(`
        SELECT kind
        FROM semantic_entities
        WHERE id = ?
    `).get(subjectEntityId) as { kind: string } | undefined;
    if (!entity) {
        throw new Error(`Unknown representation subject '${subjectEntityId}'.`);
    }
    if (entity.kind !== 'photograph' && entity.kind !== 'artefact') {
        throw new Error(
            `Archive representations require a photograph or artefact subject; received '${entity.kind}'.`,
        );
    }
    return entity.kind;
}

function assertDerivedRepresentationExists(db: DbHandle, representationIdValue: string | null): void {
    if (!representationIdValue) {
        return;
    }
    const representation = db.prepare(`
        SELECT id
        FROM archive_representations
        WHERE id = ?
    `).get(representationIdValue);
    if (!representation) {
        throw new Error(`Unknown derived-from representation '${representationIdValue}'.`);
    }
}

function loadRepresentation(db: DbHandle, id: string): RepresentationRow | undefined {
    return db.prepare(`
        SELECT
            r.id,
            r.asset_id,
            r.subject_entity_id,
            e.kind AS subject_kind,
            r.representation_kind,
            r.facet,
            r.source_kind,
            r.source_ref,
            r.derived_from_representation_id,
            r.created_at
        FROM archive_representations r
        JOIN semantic_entities e ON e.id = r.subject_entity_id
        WHERE r.id = ?
    `).get(id) as RepresentationRow | undefined;
}

function assertExistingRepresentationCompatible(
    existing: RepresentationRow | undefined,
    input: EnsureArchiveRepresentationInput,
): void {
    if (!existing) {
        return;
    }
    const requestedParent = input.derivedFromRepresentationId ?? null;
    if (existing.derived_from_representation_id !== requestedParent) {
        throw new Error(
            `Representation '${existing.id}' already exists with a different derivation parent.`,
        );
    }
}

function toArchiveRepresentation(row: RepresentationRow): ArchiveRepresentation {
    return {
        id: row.id,
        assetId: row.asset_id,
        subjectEntityId: row.subject_entity_id,
        subjectKind: row.subject_kind,
        representationKind: row.representation_kind,
        facet: row.facet,
        sourceKind: row.source_kind,
        sourceRef: row.source_ref,
        derivedFromRepresentationId: row.derived_from_representation_id,
        createdAt: row.created_at,
    };
}

export function ensureArchiveRepresentation(
    db: DbHandle,
    input: EnsureArchiveRepresentationInput,
): ArchiveRepresentation {
    assertAssetExists(db, input.assetId);
    loadSubjectKind(db, input.subjectEntityId);
    const derivedFromRepresentationId = input.derivedFromRepresentationId ?? null;
    assertDerivedRepresentationExists(db, derivedFromRepresentationId);

    const id = representationId(input);
    const existing = loadRepresentation(db, id);
    assertExistingRepresentationCompatible(existing, input);
    if (existing) {
        return toArchiveRepresentation(existing);
    }

    db.prepare(`
        INSERT INTO archive_representations (
            id,
            asset_id,
            subject_entity_id,
            representation_kind,
            facet,
            source_kind,
            source_ref,
            derived_from_representation_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.assetId,
        input.subjectEntityId,
        input.representationKind,
        input.facet ?? null,
        input.sourceKind,
        input.sourceRef ?? null,
        derivedFromRepresentationId,
    );

    return toArchiveRepresentation(loadRepresentation(db, id)!);
}

export function getArchiveRepresentationsForAsset(
    db: DbHandle,
    assetId: string,
): ArchiveRepresentation[] {
    const rows = db.prepare(`
        SELECT
            r.id,
            r.asset_id,
            r.subject_entity_id,
            e.kind AS subject_kind,
            r.representation_kind,
            r.facet,
            r.source_kind,
            r.source_ref,
            r.derived_from_representation_id,
            r.created_at
        FROM archive_representations r
        JOIN semantic_entities e ON e.id = r.subject_entity_id
        WHERE r.asset_id = ?
        ORDER BY e.kind ASC, r.representation_kind ASC, COALESCE(r.facet, '') ASC, r.id ASC
    `).all(assetId) as RepresentationRow[];
    return rows.map(toArchiveRepresentation);
}

export function getArchiveRepresentationsForSubject(
    db: DbHandle,
    subjectEntityId: string,
): ArchiveRepresentation[] {
    const rows = db.prepare(`
        SELECT
            r.id,
            r.asset_id,
            r.subject_entity_id,
            e.kind AS subject_kind,
            r.representation_kind,
            r.facet,
            r.source_kind,
            r.source_ref,
            r.derived_from_representation_id,
            r.created_at
        FROM archive_representations r
        JOIN semantic_entities e ON e.id = r.subject_entity_id
        WHERE r.subject_entity_id = ?
        ORDER BY r.created_at ASC, r.id ASC
    `).all(subjectEntityId) as RepresentationRow[];
    return rows.map(toArchiveRepresentation);
}
