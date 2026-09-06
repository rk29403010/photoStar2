import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
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
    assetIdentityGuid: string;
    currentAssetId: string | null;
    originalPath: string;
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

type AssetIdentity = {
    guid: string;
    originalPath: string;
};

type RepresentationRow = {
    id: string;
    asset_identity_guid: string;
    current_asset_id: string | null;
    original_path: string;
    subject_entity_id: string;
    subject_kind: 'photograph' | 'artefact';
    representation_kind: ArchiveRepresentationKind;
    facet: string | null;
    source_kind: ArchiveRepresentationSourceKind;
    source_ref: string | null;
    derived_from_representation_id: string | null;
    created_at: string;
};

const REPRESENTATION_SELECT = `
    SELECT
        r.id,
        r.asset_identity_guid,
        (
            SELECT current_asset.id
            FROM assets current_asset
            WHERE current_asset.original_path = ai.original_path
            ORDER BY current_asset.created_at DESC, current_asset.id DESC
            LIMIT 1
        ) AS current_asset_id,
        ai.original_path,
        r.subject_entity_id,
        e.kind AS subject_kind,
        r.representation_kind,
        r.facet,
        r.source_kind,
        r.source_ref,
        r.derived_from_representation_id,
        r.created_at
    FROM archive_representations r
    JOIN asset_identities ai ON ai.guid = r.asset_identity_guid
    JOIN semantic_entities e ON e.id = r.subject_entity_id
`;

function representationId(
    assetIdentityGuid: string,
    input: EnsureArchiveRepresentationInput,
): string {
    const digest = createHash('sha256')
        .update(assetIdentityGuid)
        .update('\n')
        .update(input.subjectEntityId)
        .update('\n')
        .update(input.representationKind)
        .update('\n')
        .update(input.facet ?? '')
        .digest('hex');
    return `representation:${digest}`;
}

function loadAssetPath(db: DbHandle, assetId: string): string {
    const asset = db.prepare(`
        SELECT original_path
        FROM assets
        WHERE id = ?
    `).get(assetId) as { original_path: string } | undefined;
    if (!asset) {
        throw new Error(`Unknown representation asset '${assetId}'.`);
    }
    return asset.original_path;
}

function findAssetIdentityByPath(db: DbHandle, originalPath: string): AssetIdentity | undefined {
    const row = db.prepare(`
        SELECT guid, original_path
        FROM asset_identities
        WHERE original_path = ?
    `).get(originalPath) as { guid: string; original_path: string } | undefined;
    return row ? { guid: row.guid, originalPath: row.original_path } : undefined;
}

function ensureAssetIdentity(db: DbHandle, assetId: string): AssetIdentity {
    const originalPath = loadAssetPath(db, assetId);
    const existing = findAssetIdentityByPath(db, originalPath);
    if (existing) {
        return existing;
    }
    const guid = uuidv4();
    db.prepare(`
        INSERT INTO asset_identities (guid, original_path)
        VALUES (?, ?)
    `).run(guid, originalPath);
    return { guid, originalPath };
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
    return db.prepare(`${REPRESENTATION_SELECT} WHERE r.id = ?`).get(id) as RepresentationRow | undefined;
}

function loadRepresentationByIdentity(
    db: DbHandle,
    assetIdentityGuid: string,
    input: EnsureArchiveRepresentationInput,
): RepresentationRow | undefined {
    return db.prepare(`
        ${REPRESENTATION_SELECT}
        WHERE r.asset_identity_guid = ?
          AND r.subject_entity_id = ?
          AND r.representation_kind = ?
          AND COALESCE(r.facet, '') = COALESCE(?, '')
    `).get(
        assetIdentityGuid,
        input.subjectEntityId,
        input.representationKind,
        input.facet ?? null,
    ) as RepresentationRow | undefined;
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
        assetIdentityGuid: row.asset_identity_guid,
        currentAssetId: row.current_asset_id,
        originalPath: row.original_path,
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
    const assetIdentity = ensureAssetIdentity(db, input.assetId);
    loadSubjectKind(db, input.subjectEntityId);
    const derivedFromRepresentationId = input.derivedFromRepresentationId ?? null;
    assertDerivedRepresentationExists(db, derivedFromRepresentationId);

    const existing = loadRepresentationByIdentity(db, assetIdentity.guid, input);
    assertExistingRepresentationCompatible(existing, input);
    if (existing) {
        return toArchiveRepresentation(existing);
    }

    const id = representationId(assetIdentity.guid, input);
    db.prepare(`
        INSERT INTO archive_representations (
            id,
            asset_identity_guid,
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
        assetIdentity.guid,
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
    const originalPath = loadAssetPath(db, assetId);
    const identity = findAssetIdentityByPath(db, originalPath);
    if (!identity) {
        return [];
    }
    const rows = db.prepare(`
        ${REPRESENTATION_SELECT}
        WHERE r.asset_identity_guid = ?
        ORDER BY e.kind ASC, r.representation_kind ASC, COALESCE(r.facet, '') ASC, r.id ASC
    `).all(identity.guid) as RepresentationRow[];
    return rows.map(toArchiveRepresentation);
}

export function getArchiveRepresentationsForSubject(
    db: DbHandle,
    subjectEntityId: string,
): ArchiveRepresentation[] {
    const rows = db.prepare(`
        ${REPRESENTATION_SELECT}
        WHERE r.subject_entity_id = ?
        ORDER BY r.created_at ASC, r.id ASC
    `).all(subjectEntityId) as RepresentationRow[];
    return rows.map(toArchiveRepresentation);
}
