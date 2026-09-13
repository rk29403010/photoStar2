import type { DatabaseManager } from '../../data/db';
import type { PhotoMaskMetadata } from '../../boundary/contracts/photoEditor';
import {
    ensureSemanticEntity,
    putSemanticProposition,
    recordSemanticDecision,
} from '../relationships/semanticRepository';
import { getSemanticPredicateManifest } from '../relationships/predicates/registry';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type ManualDecisionStatus = 'accepted' | 'rejected';

export type StableFacePosition = {
    faceId: string;
    visualRegionId: string;
    assetId: string;
    faceIndex: number;
};

type RecordFacePersonDecisionInput = {
    assetId: string;
    faceIndex: number;
    personId: string;
    personName?: string | null;
    status: ManualDecisionStatus;
    sourceRef: string;
};

export type RecordStableFacePersonDecisionInput = {
    faceId: string;
    personId: string;
    personName?: string | null;
    status: ManualDecisionStatus;
    sourceRef: string;
};

const FACE_MASK_SOURCE_ID = 'runtime.detect_faces';

function loadFaceMaskMetadata(db: DbHandle, assetId: string): PhotoMaskMetadata | null {
    const row = db.prepare(`
        SELECT data
        FROM asset_mask_metadata
        WHERE asset_id = ? AND source_id = ?
    `).get(assetId, FACE_MASK_SOURCE_ID) as { data: string } | undefined;
    if (!row) {
        return null;
    }
    try {
        const parsed = JSON.parse(row.data) as PhotoMaskMetadata;
        return parsed.schemaVersion === 1 && Array.isArray(parsed.masks) ? parsed : null;
    } catch {
        return null;
    }
}

function faceIdForVisualRegion(db: DbHandle, visualRegionId: string): string | null {
    const row = db.prepare('SELECT id FROM faces WHERE visual_region_id = ?')
        .get(visualRegionId) as { id: string } | undefined;
    return row?.id ?? null;
}

export function resolveStableFaceAtLegacyPosition(
    db: DbHandle,
    assetId: string,
    faceIndex: number,
): StableFacePosition {
    const metadata = loadFaceMaskMetadata(db, assetId);
    const mask = metadata?.masks[faceIndex];
    const visualRegionId = mask?.visualRegionId;
    if (!visualRegionId) {
        throw new Error(`Face ${faceIndex} on asset '${assetId}' has no stable VisualRegion identity.`);
    }
    const faceId = faceIdForVisualRegion(db, visualRegionId);
    if (!faceId) {
        throw new Error(`VisualRegion '${visualRegionId}' has no stable Face identity.`);
    }
    return { faceId, visualRegionId, assetId, faceIndex };
}

function ensurePersonEntity(
    db: DbHandle,
    personId: string,
    personName?: string | null,
): string {
    return ensureSemanticEntity(db, {
        kind: 'person',
        nativeId: personId,
        label: personName ?? null,
    });
}

function depictsScopeKey(faceId: string): string {
    return `${faceId}:depicts`;
}

export function recordManualFacePersonDecisionByFaceId(
    db: DbHandle,
    input: RecordStableFacePersonDecisionInput,
): { faceId: string; personEntityId: string; propositionId: string; decisionId: string } {
    const position = resolveStableFaceById(db, input.faceId);
    const predicate = getSemanticPredicateManifest('depicts');
    const personEntityId = ensurePersonEntity(db, input.personId, input.personName);
    const propositionId = putSemanticProposition(db, {
        scopeKey: depictsScopeKey(position.faceId),
        subjectEntityId: position.faceId,
        predicate: predicate.key,
        object: { type: 'entity', entityId: personEntityId },
    });
    const decisionId = recordSemanticDecision(db, {
        scopeKey: depictsScopeKey(position.faceId),
        status: input.status,
        propositionId,
        sourceKind: 'human',
        sourceRef: input.sourceRef,
    });
    return { faceId: position.faceId, personEntityId, propositionId, decisionId };
}

export function recordManualFacePersonDecision(
    db: DbHandle,
    input: RecordFacePersonDecisionInput,
): { faceId: string; personEntityId: string; propositionId: string; decisionId: string } {
    const position = resolveStableFaceAtLegacyPosition(db, input.assetId, input.faceIndex);
    return recordManualFacePersonDecisionByFaceId(db, {
        faceId: position.faceId,
        personId: input.personId,
        personName: input.personName,
        status: input.status,
        sourceRef: input.sourceRef,
    });
}

export function acceptCurrentAssignmentsForPerson(
    db: DbHandle,
    personId: string,
    personName: string,
    sourceRef: string,
): number {
    const assignments = db.prepare(`
        SELECT asset_id, face_index
        FROM face_assignments
        WHERE person_id = ?
        ORDER BY asset_id ASC, face_index ASC
    `).all(personId) as Array<{ asset_id: string; face_index: number }>;
    for (const assignment of assignments) {
        recordManualFacePersonDecision(db, {
            assetId: assignment.asset_id,
            faceIndex: assignment.face_index,
            personId,
            personName,
            status: 'accepted',
            sourceRef,
        });
    }
    return assignments.length;
}

export function updateSemanticPersonLabel(
    db: DbHandle,
    personId: string,
    personName: string,
): string {
    return ensurePersonEntity(db, personId, personName);
}

function currentPositionForFace(db: DbHandle, faceId: string): StableFacePosition | null {
    const row = db.prepare(`
        SELECT f.id AS face_id, f.visual_region_id, a.id AS asset_id
        FROM faces f
        JOIN visual_regions vr ON vr.id = f.visual_region_id
        JOIN asset_identities ai ON ai.guid = vr.asset_identity_guid
        JOIN assets a ON a.original_path = ai.original_path
        WHERE f.id = ?
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
    `).get(faceId) as {
        face_id: string;
        visual_region_id: string;
        asset_id: string;
    } | undefined;
    if (!row) {
        return null;
    }
    const metadata = loadFaceMaskMetadata(db, row.asset_id);
    const faceIndex = metadata?.masks.findIndex((mask) => mask.visualRegionId === row.visual_region_id) ?? -1;
    if (faceIndex < 0) {
        return null;
    }
    return {
        faceId: row.face_id,
        visualRegionId: row.visual_region_id,
        assetId: row.asset_id,
        faceIndex,
    };
}

export function resolveStableFaceById(db: DbHandle, faceId: string): StableFacePosition {
    const position = currentPositionForFace(db, faceId);
    if (!position) {
        throw new Error(`Stable Face '${faceId}' has no current asset position.`);
    }
    return position;
}

type DurableDecisionRow = {
    face_id: string;
    person_id: string;
    person_name: string | null;
    status: ManualDecisionStatus;
};

function loadCurrentManualDecisions(db: DbHandle): DurableDecisionRow[] {
    return db.prepare(`
        SELECT
            proposition.subject_entity_id AS face_id,
            person.native_id AS person_id,
            person.label AS person_name,
            decision.status
        FROM semantic_decisions decision
        JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
        JOIN semantic_entities person ON person.id = proposition.object_entity_id
        WHERE decision.is_current = 1
          AND decision.source_kind != 'machine'
          AND proposition.predicate = 'depicts'
          AND person.kind = 'person'
          AND decision.status IN ('accepted', 'rejected')
        ORDER BY decision.created_at ASC, decision.id ASC
    `).all() as DurableDecisionRow[];
}

function ensureCompatibilityPerson(db: DbHandle, row: DurableDecisionRow): void {
    if (row.status !== 'accepted') {
        return;
    }
    db.prepare(`
        INSERT INTO people (id, name, thumbnail_path)
        VALUES (?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET name = COALESCE(?, people.name)
    `).run(row.person_id, row.person_name ?? 'Unknown Person', row.person_name);
}

export function applyStableManualFaceDecisionProjection(db: DbHandle): void {
    for (const decision of loadCurrentManualDecisions(db)) {
        const position = currentPositionForFace(db, decision.face_id);
        if (!position) {
            continue;
        }
        if (decision.status === 'accepted') {
            ensureCompatibilityPerson(db, decision);
            db.prepare(`
                UPDATE face_assignments
                SET person_id = ?, is_suggested = 0
                WHERE asset_id = ? AND face_index = ?
            `).run(decision.person_id, position.assetId, position.faceIndex);
        } else {
            db.prepare(`
                DELETE FROM face_assignments
                WHERE asset_id = ? AND face_index = ? AND person_id = ?
            `).run(position.assetId, position.faceIndex, decision.person_id);
        }
    }
}

export function getRejectedAssetIdsForPerson(db: DbHandle, personId: string): string[] {
    const personEntityId = `person:${personId}`;
    const rows = db.prepare(`
        SELECT DISTINCT proposition.subject_entity_id AS face_id
        FROM semantic_decisions decision
        JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
        WHERE proposition.predicate = 'depicts'
          AND proposition.object_entity_id = ?
          AND decision.status = 'rejected'
          AND decision.source_kind != 'machine'
        ORDER BY proposition.subject_entity_id ASC
    `).all(personEntityId) as Array<{ face_id: string }>;
    const assetIds = new Set<string>();
    for (const row of rows) {
        const position = currentPositionForFace(db, row.face_id);
        if (position) {
            assetIds.add(position.assetId);
        }
    }
    return [...assetIds].sort((left, right) => left.localeCompare(right));
}
